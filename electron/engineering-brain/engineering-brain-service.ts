import { randomUUID } from "node:crypto";
import type {
  EngineeringBrainEvent,
  EngineeringBrainOperation,
  EngineeringBrainOperationStatus,
  EngineeringBrainPolicy,
  StartEngineeringBrainOperationRequest,
} from "../../shared/engineering-brain";

/**
 * Everything a registered operation handler needs to do its work and
 * cooperate with cancellation. Handlers never touch persistence, IPC, or
 * credentials directly here — Phase 1 ships no handlers at all (see
 * docs/architecture/DELIVERY_ROADMAP.md M1 exit criteria: "no credentials
 * or external calls exist yet"). Later skills (Backlog Intelligence's
 * scan orchestrator, starting at M4) register their own handlers.
 */
export interface OperationHandlerContext {
  input: Record<string, unknown>;
  operationId: string;
  policy: EngineeringBrainPolicy;
  reportProgress: (progress: number) => void;
  signal: AbortSignal;
}

export type OperationHandler = (
  context: OperationHandlerContext,
) => Promise<void>;

export type EngineeringBrainEventListener = (
  event: EngineeringBrainEvent,
) => void;

export class UnknownOperationKindError extends Error {
  constructor(kind: string) {
    super(`No operation handler is registered for kind "${kind}".`);
    this.name = "UnknownOperationKindError";
  }
}

export class OperationConcurrencyLimitError extends Error {
  constructor(limit: number) {
    super(
      `Refusing to start a new operation: ${limit} concurrent operation(s) already active under the requested policy.`,
    );
    this.name = "OperationConcurrencyLimitError";
  }
}

interface InternalOperation {
  abortController: AbortController;
  record: EngineeringBrainOperation;
}

function isActive(status: EngineeringBrainOperationStatus): boolean {
  return status === "pending" || status === "running";
}

/**
 * In-memory Engineering Brain operation registry: start/query/cancel plus
 * an event stream, matching the EngineeringBrainDesktopApi contract in
 * shared/engineering-brain.ts. Operations are not persisted — Phase 1's
 * SQLite store only holds the (currently empty) Backlog Intelligence
 * schema, not operation bookkeeping, so a restart clears in-flight state.
 * That is an accepted Phase 1 limitation, not a design decision for later
 * phases.
 */
export class EngineeringBrainService {
  private readonly operations = new Map<string, InternalOperation>();
  private readonly handlers = new Map<string, OperationHandler>();
  private readonly listeners = new Set<EngineeringBrainEventListener>();

  registerOperationHandler(kind: string, handler: OperationHandler): void {
    this.handlers.set(kind, handler);
  }

  unregisterOperationHandler(kind: string): void {
    this.handlers.delete(kind);
  }

  subscribe(listener: EngineeringBrainEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async getOperation(
    operationId: string,
  ): Promise<EngineeringBrainOperation | null> {
    return this.operations.get(operationId)?.record ?? null;
  }

  async listOperations(): Promise<EngineeringBrainOperation[]> {
    return Array.from(this.operations.values(), (entry) => entry.record);
  }

  async startOperation(
    request: StartEngineeringBrainOperationRequest,
  ): Promise<EngineeringBrainOperation> {
    const activeCount = Array.from(this.operations.values()).filter((entry) =>
      isActive(entry.record.status),
    ).length;
    if (activeCount >= request.policy.maxConcurrentOperations) {
      throw new OperationConcurrencyLimitError(
        request.policy.maxConcurrentOperations,
      );
    }

    const handler = this.handlers.get(request.kind);
    if (!handler) {
      throw new UnknownOperationKindError(request.kind);
    }

    const now = new Date().toISOString();
    const operationId = randomUUID();
    const abortController = new AbortController();
    const record: EngineeringBrainOperation = {
      completedAt: null,
      createdAt: now,
      errorCode: null,
      id: operationId,
      kind: request.kind,
      progress: 0,
      status: "pending",
      updatedAt: now,
    };

    this.operations.set(operationId, { abortController, record });
    // Snapshot the "pending" record to return before kicking off the
    // handler: runOperation flips status to "running" synchronously (up
    // to its first await), so reading `record` after that call would
    // return a state newer than what startOperation is meant to hand
    // back to its caller.
    const createdSnapshot = { ...record };
    this.emit({ operation: createdSnapshot, type: "operation-created" });

    void this.runOperation(operationId, request, handler, abortController.signal);

    return createdSnapshot;
  }

  async cancelOperation(operationId: string): Promise<void> {
    const entry = this.operations.get(operationId);
    if (!entry || !isActive(entry.record.status)) {
      return;
    }

    entry.abortController.abort();
    this.updateStatus(entry, "cancelled");
    this.emit({ operation: { ...entry.record }, type: "operation-cancelled" });
  }

  private async runOperation(
    operationId: string,
    request: StartEngineeringBrainOperationRequest,
    handler: OperationHandler,
    signal: AbortSignal,
  ): Promise<void> {
    const entry = this.operations.get(operationId);
    if (!entry) {
      return;
    }

    this.updateStatus(entry, "running");

    try {
      await handler({
        input: request.input,
        operationId,
        policy: request.policy,
        reportProgress: (progress) => this.reportProgress(entry, progress),
        signal,
      });

      // A handler may have cooperatively stopped after an abort without
      // throwing — cancellation already recorded the terminal state, so
      // don't overwrite it with "completed".
      if (entry.record.status === "running") {
        this.updateStatus(entry, "completed");
        this.emit({ operation: { ...entry.record }, type: "operation-completed" });
      }
    } catch (error) {
      if (entry.record.status !== "running") {
        return;
      }

      const errorCode =
        error instanceof Error && error.name ? error.name : "OPERATION_FAILED";
      entry.record.errorCode = errorCode;
      this.updateStatus(entry, "failed");
      this.emit({
        errorCode,
        operation: { ...entry.record },
        type: "operation-failed",
      });
    }
  }

  private reportProgress(entry: InternalOperation, progress: number): void {
    if (!isActive(entry.record.status)) {
      return;
    }

    const clamped = Math.min(1, Math.max(0, progress));
    entry.record.progress = clamped;
    entry.record.updatedAt = new Date().toISOString();
    this.emit({
      operationId: entry.record.id,
      progress: clamped,
      stage: entry.record.kind,
      type: "operation-progress",
    });
  }

  private updateStatus(
    entry: InternalOperation,
    status: EngineeringBrainOperationStatus,
  ): void {
    const now = new Date().toISOString();
    entry.record.status = status;
    entry.record.updatedAt = now;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      entry.record.completedAt = now;
      entry.record.progress = status === "completed" ? 1 : entry.record.progress;
    }
  }

  private emit(event: EngineeringBrainEvent): void {
    for (const listener of Array.from(this.listeners)) {
      listener(event);
    }
  }
}
