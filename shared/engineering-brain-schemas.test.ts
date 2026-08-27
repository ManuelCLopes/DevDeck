import test from "node:test";
import assert from "node:assert/strict";
import {
  engineeringBrainPolicySchema,
  startEngineeringBrainOperationRequestSchema,
} from "./engineering-brain-schemas";

const validPolicy = {
  allowedProjectIds: [],
  allowExternalModelRequests: false,
  maxConcurrentOperations: 1,
  maxContextCharacters: 1000,
  maxEstimatedCost: null,
  maxEvidenceItems: 10,
  modelProviderId: null,
  rulesOnly: true,
};

test("engineeringBrainPolicySchema accepts a rules-only, no-external-calls policy", () => {
  assert.doesNotThrow(() => engineeringBrainPolicySchema.parse(validPolicy));
});

test("engineeringBrainPolicySchema rejects a non-positive concurrency limit", () => {
  assert.throws(() =>
    engineeringBrainPolicySchema.parse({ ...validPolicy, maxConcurrentOperations: 0 }),
  );
});

test("startEngineeringBrainOperationRequestSchema accepts an open-ended kind and input", () => {
  const request = startEngineeringBrainOperationRequestSchema.parse({
    input: { some: "value" },
    kind: "not-yet-a-real-skill",
    policy: validPolicy,
  });
  assert.equal(request.kind, "not-yet-a-real-skill");
});

test("startEngineeringBrainOperationRequestSchema rejects a missing policy", () => {
  assert.throws(() =>
    startEngineeringBrainOperationRequestSchema.parse({
      input: {},
      kind: "anything",
    }),
  );
});
