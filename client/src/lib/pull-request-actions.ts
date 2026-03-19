export function parseReviewerLogins(input: string) {
  const seenLogins = new Set<string>();

  for (const rawSegment of input.split(/[,\s]+/)) {
    const normalizedLogin = rawSegment.trim().replace(/^@+/, "");
    if (!normalizedLogin) {
      continue;
    }

    seenLogins.add(normalizedLogin);
  }

  return Array.from(seenLogins);
}
