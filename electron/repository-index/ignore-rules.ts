import { createHash } from "node:crypto";
import path from "node:path";

/**
 * Default deny patterns from
 * docs/BACKLOG_INTELLIGENCE_INTEGRATION_PLAN.md section 12. Excluded
 * files are never read, let alone indexed or sent anywhere — this list
 * is deliberately the same one documented for the (not-yet-built) AI
 * redaction policy, because "never read" is a strictly stronger
 * guarantee than "read but redact before sending."
 */
export const DEFAULT_DENY_PATTERNS = [
  ".env*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.jks",
  "secrets/**",
  "credentials/**",
  "node_modules/**",
  "dist/**",
  "build/**",
  ".git/**",
];

/** Files larger than this are skipped outright — never partially read either. */
export const MAX_INDEXABLE_FILE_BYTES = 512 * 1024;

type IgnorePredicate = (relativePath: string, basename: string) => boolean;

function compilePattern(pattern: string): IgnorePredicate {
  if (pattern.endsWith("/**")) {
    const segment = pattern.slice(0, -"/**".length);
    return (relativePath) =>
      relativePath
        .split("/")
        .some((pathSegment) => pathSegment === segment);
  }
  if (pattern.startsWith("*") && !pattern.slice(1).includes("*")) {
    const suffix = pattern.slice(1);
    return (_relativePath, basename) => basename.endsWith(suffix);
  }
  if (pattern.endsWith("*") && !pattern.slice(0, -1).includes("*")) {
    const prefix = pattern.slice(0, -1);
    return (_relativePath, basename) => basename.startsWith(prefix);
  }
  // Fall back to an exact basename match for any pattern shape not
  // covered above, rather than silently matching nothing.
  return (_relativePath, basename) => basename === pattern;
}

export class IgnoreRules {
  private readonly patterns: string[];
  private readonly predicates: IgnorePredicate[];

  constructor(patterns: string[] = DEFAULT_DENY_PATTERNS) {
    this.patterns = [...patterns].sort();
    this.predicates = patterns.map(compilePattern);
  }

  /** @param relativePath POSIX-separated, relative to the repository root. */
  isIgnored(relativePath: string): boolean {
    const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    const basename = path.posix.basename(normalized);
    return this.predicates.some((predicate) => predicate(normalized, basename));
  }

  /** Stable across process restarts — part of the repository fingerprint. */
  hash(): string {
    return createHash("sha256").update(this.patterns.join("\n")).digest("hex");
  }
}

export const DEFAULT_IGNORE_RULES = new IgnoreRules();

/**
 * Binary-content heuristic: a NUL byte anywhere in a leading sample is
 * the same signal `git` and most text tools use. Checked before a file
 * is included in lexical search results or excerpted into evidence.
 */
export function isLikelyBinaryContent(sample: Buffer): boolean {
  const scanLength = Math.min(sample.length, 8000);
  for (let index = 0; index < scanLength; index += 1) {
    if (sample[index] === 0) {
      return true;
    }
  }
  return false;
}
