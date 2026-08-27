/**
 * Feature flags for the Engineering Brain platform and its first skill,
 * Backlog Intelligence.
 *
 * Every flag defaults to disabled. Enabling a flag never implies enabling
 * the flags it depends on — callers must check the flags they rely on
 * directly rather than inferring one from another.
 *
 * See docs/architecture/DELIVERY_ROADMAP.md ("Feature flags") and
 * docs/ENGINEERING_BRAIN_RFC.md (section 33) for the rollout plan behind
 * each flag.
 */
export interface BacklogFeatureFlags {
  /** Master switch for the Backlog Intelligence domain (route, nav, IPC). */
  backlogIntelligenceEnabled: boolean;
  /** Jira Cloud connection and synchronisation. Not implemented before M2. */
  jiraSyncEnabled: boolean;
  /** Local repository indexing for evidence collection. Not implemented before M3. */
  repositoryIndexEnabled: boolean;
  /** Deterministic, rules-only backlog assessment. Not implemented before M4. */
  rulesAssessmentEnabled: boolean;
  /** Optional model-assisted assessment. Not implemented before M5. */
  modelAssessmentEnabled: boolean;
  /** Scheduled/background sync and rescans. Not implemented before M8. */
  backgroundSyncEnabled: boolean;
  /** Controlled Jira write-back actions. Not implemented before M7. */
  jiraWriteBackEnabled: boolean;
  /** Local embeddings / semantic retrieval. Not implemented before M9. */
  semanticIndexEnabled: boolean;
}

/**
 * All flags default to off. Phase 1 only introduces the platform shell, so
 * `backlogIntelligenceEnabled` may be turned on to reveal the empty Backlog
 * route shell without turning on any capability that talks to Jira, an
 * LLM provider, or the network.
 */
export const DEFAULT_BACKLOG_FEATURE_FLAGS: BacklogFeatureFlags = {
  backlogIntelligenceEnabled: false,
  jiraSyncEnabled: false,
  repositoryIndexEnabled: false,
  rulesAssessmentEnabled: false,
  modelAssessmentEnabled: false,
  backgroundSyncEnabled: false,
  jiraWriteBackEnabled: false,
  semanticIndexEnabled: false,
};

const FLAG_ENV_VARS: Record<keyof BacklogFeatureFlags, string> = {
  backlogIntelligenceEnabled: "DEVDECK_FEATURE_BACKLOG_INTELLIGENCE",
  jiraSyncEnabled: "DEVDECK_FEATURE_JIRA_SYNC",
  repositoryIndexEnabled: "DEVDECK_FEATURE_REPOSITORY_INDEX",
  rulesAssessmentEnabled: "DEVDECK_FEATURE_RULES_ASSESSMENT",
  modelAssessmentEnabled: "DEVDECK_FEATURE_MODEL_ASSESSMENT",
  backgroundSyncEnabled: "DEVDECK_FEATURE_BACKGROUND_SYNC",
  jiraWriteBackEnabled: "DEVDECK_FEATURE_JIRA_WRITE_BACK",
  semanticIndexEnabled: "DEVDECK_FEATURE_SEMANTIC_INDEX",
};

function parseBooleanFlag(rawValue: string | undefined): boolean | null {
  if (rawValue === undefined) {
    return null;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "") {
    return false;
  }

  return null;
}

/**
 * Resolves feature flags from environment variables, falling back to the
 * documented defaults. This is intentionally the only override mechanism
 * in Phase 1 — there is no remote config and no persisted user toggle yet.
 */
export function resolveBacklogFeatureFlags(
  env: NodeJS.ProcessEnv = process.env,
): BacklogFeatureFlags {
  const resolved = { ...DEFAULT_BACKLOG_FEATURE_FLAGS };

  for (const key of Object.keys(FLAG_ENV_VARS) as Array<keyof BacklogFeatureFlags>) {
    const parsed = parseBooleanFlag(env[FLAG_ENV_VARS[key]]);
    if (parsed !== null) {
      resolved[key] = parsed;
    }
  }

  return resolved;
}
