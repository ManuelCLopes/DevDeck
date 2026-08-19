import test from "node:test";
import assert from "node:assert/strict";
import type { EngineeringBrainEvent } from "../../shared/engineering-brain";
import {
  EngineeringBrainService,
  OperationConcurrencyLimitError,
  UnknownOperationKindError,
} from "./engineering-brain-service";

const BASE_POLICY = {
  allowedProjectIds: [],
  allowExternalModelRequests: false,
  maxConcurrentOperations: 2,
  maxContextCharacters: 1000,
  maxEstimatedCost: null,
  maxEvidenceItems: 10,
  modelProviderId: null,
  rulesOnly: true,
};

function waitFor(conditionFn: () => boolean, timeoutMs = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (conditionFn()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Timed out waiting for condition"));
        return;
      }
      setTimeout(check, 5);
    };
    check();
  });
}

test("startOperation rejects an unregistered operation kind", async () => {
  const service = new EngineeringBrainService();
  await assert.rejects(
    () =>
      service.startOperation({ input: {}, kind: "unknown-kind", policy: BASE_POLICY }),
    UnknownOperationKindError,
  );
});

test("startOperation runs a registered handler through to completion", async () => {
  const service = new EngineeringBrainService();
  const events: EngineeringBrainEvent["type"][] = [];
  service.subscribe((event) => events.push(event.type));

  service.registerOperationHandler("noop", async ({ reportProgress }) => {
    reportProgress(0.5);
  });

  const created = await service.startOperation({
    input: {},
    kind: "noop",
    policy: BASE_POLICY,
  });
  assert.equal(created.status, "pending");

  await waitFor(async () => {
    const current = await service.getOperation(created.id);
    return current?.status === "completed";
  });

  const finalOperation = await service.getOperation(created.id);
  assert.equal(finalOperation?.status, "completed");
  assert.equal(finalOperation?.progress, 1);
  assert.equal(finalOperation?.completedAt !== null, true);
  assert.deepEqual(events, [
    "operation-created",
    "operation-progress",
    "operation-completed",
  ]);
});

test("startOperation records a failed handler without throwing out of the service", async () => {
  const service = new EngineeringBrainService();
  service.registerOperationHandler("boom", async () => {
    throw new Error("handler exploded");
  });

  const created = await service.startOperation({
    input: {},
    kind: "boom",
    policy: BASE_POLICY,
  });

  await waitFor(async () => {
    const current = await service.getOperation(created.id);
    return current?.status === "failed";
  });

  const failed = await service.getOperation(created.id);
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.errorCode, "Error");
});

test("cancelOperation aborts the handler's signal and marks the operation cancelled", async () => {
  const service = new EngineeringBrainService();
  let observedAborted = false;

  service.registerOperationHandler("cancellable", ({ signal }) => {
    return new Promise((resolve) => {
      signal.addEventListener("abort", () => {
        observedAborted = true;
        resolve();
      });
    });
  });

  const created = await service.startOperation({
    input: {},
    kind: "cancellable",
    policy: BASE_POLICY,
  });

  await waitFor(async () => {
    const current = await service.getOperation(created.id);
    return current?.status === "running";
  });

  await service.cancelOperation(created.id);

  const cancelled = await service.getOperation(created.id);
  assert.equal(cancelled?.status, "cancelled");
  assert.equal(observedAborted, true);
});

test("startOperation enforces the requested policy's concurrency limit", async () => {
  const service = new EngineeringBrainService();
  let releaseFirst: () => void = () => {};
  service.registerOperationHandler("slow", () => {
    return new Promise((resolve) => {
      releaseFirst = resolve;
    });
  });

  const singleConcurrencyPolicy = { ...BASE_POLICY, maxConcurrentOperations: 1 };
  const first = await service.startOperation({
    input: {},
    kind: "slow",
    policy: singleConcurrencyPolicy,
  });
  await waitFor(async () => (await service.getOperation(first.id))?.status === "running");

  await assert.rejects(
    () =>
      service.startOperation({ input: {}, kind: "slow", policy: singleConcurrencyPolicy }),
    OperationConcurrencyLimitError,
  );

  releaseFirst();
});

test("getOperation returns null for an unknown id and listOperations reflects started work", async () => {
  const service = new EngineeringBrainService();
  assert.equal(await service.getOperation("does-not-exist"), null);

  service.registerOperationHandler("quick", async () => {});
  const created = await service.startOperation({
    input: {},
    kind: "quick",
    policy: BASE_POLICY,
  });

  const listed = await service.listOperations();
  assert.ok(listed.some((operation) => operation.id === created.id));
});
