export type EngineeringBrainSourceType =
  | "agent_trace"
  | "code"
  | "documentation"
  | "git"
  | "github"
  | "jira";

export type EngineeringBrainOperationStatus =
  | "cancelled"
  | "completed"
  | "failed"
  | "pending"
  | "running";

export type EvidenceStrength = "high" | "low" | "medium";

export interface SourceReference {
  externalUrl: string | null;
  id: string;
  sourceType: EngineeringBrainSourceType;
}

export interface RepositorySnapshotReference {
  defaultBranch: string | null;
  headSha: string;
  projectId: string;
  repositoryPath: string;
  snapshotId: string;
}

export interface EvidenceProvenance {
  collectedAt: string;
  collectorVersion: string;
  query: string | null;
  repositorySnapshotId: string | null;
  sourceReference: SourceReference;
}

export interface EngineeringEvidence {
  excerpt: string | null;
  filePath: string | null;
  id: string;
  metadata: Record<string, unknown>;
  provenance: EvidenceProvenance;
  strength: EvidenceStrength;
  symbol: string | null;
  title: string | null;
}

export interface EngineeringBrainPolicy {
  allowedProjectIds: string[];
  allowExternalModelRequests: boolean;
  maxConcurrentOperations: number;
  maxContextCharacters: number;
  maxEstimatedCost: number | null;
  maxEvidenceItems: number;
  modelProviderId: string | null;
  rulesOnly: boolean;
}

export interface EngineeringBrainOperation {
  completedAt: string | null;
  createdAt: string;
  errorCode: string | null;
  id: string;
  kind: string;
  progress: number;
  status: EngineeringBrainOperationStatus;
  updatedAt: string;
}

export type EngineeringBrainEvent =
  | {
      operation: EngineeringBrainOperation;
      type: "operation-created";
    }
  | {
      operationId: string;
      progress: number;
      stage: string;
      type: "operation-progress";
    }
  | {
      operation: EngineeringBrainOperation;
      type: "operation-completed";
    }
  | {
      errorCode: string;
      operation: EngineeringBrainOperation;
      type: "operation-failed";
    }
  | {
      operation: EngineeringBrainOperation;
      type: "operation-cancelled";
    };

export interface StartEngineeringBrainOperationRequest {
  input: Record<string, unknown>;
  kind: string;
  policy: EngineeringBrainPolicy;
}

export interface EngineeringBrainDesktopApi {
  cancelOperation(operationId: string): Promise<void>;
  getOperation(operationId: string): Promise<EngineeringBrainOperation | null>;
  listOperations(): Promise<EngineeringBrainOperation[]>;
  startOperation(
    request: StartEngineeringBrainOperationRequest,
  ): Promise<EngineeringBrainOperation>;
  subscribe(
    listener: (event: EngineeringBrainEvent) => void,
  ): () => void;
}
