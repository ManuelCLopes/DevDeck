/**
 * Converts Atlassian Document Format (ADF) — the JSON tree Jira Cloud's
 * v3 API returns for `description` and comment bodies — into plain text
 * for storage, full-text search, and display. This is deliberately not a
 * full ADF renderer: no formatting, no media, no fidelity beyond
 * "readable text a human or the rules engine can search" (BI-028).
 *
 * Jira's REST API also still accepts a plain string in some places
 * (older data, classic projects, v2 API responses) — every entry point
 * here accepts `unknown` and degrades gracefully rather than throwing.
 */

interface AdfNode {
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  text?: string;
  type?: string;
}

function isAdfNode(value: unknown): value is AdfNode {
  return typeof value === "object" && value !== null;
}

function renderChildren(node: AdfNode, separator: string): string {
  if (!Array.isArray(node.content)) {
    return "";
  }
  return node.content.map(renderAdfNode).join(separator);
}

function renderListItems(node: AdfNode, formatMarker: (index: number) => string): string {
  if (!Array.isArray(node.content)) {
    return "";
  }
  return node.content
    .map((item, index) => `${formatMarker(index)}${renderAdfNode(item)}`)
    .join("\n");
}

function renderAdfNode(node: unknown): string {
  if (!isAdfNode(node)) {
    return "";
  }

  switch (node.type) {
    case "text":
      return node.text ?? "";
    case "hardBreak":
      return "\n";
    case "rule":
      return "\n---\n";
    case "paragraph":
    case "blockquote":
      return renderChildren(node, "");
    case "heading":
      return renderChildren(node, "");
    case "codeBlock":
      return renderChildren(node, "");
    case "bulletList":
      return renderListItems(node, () => "- ");
    case "orderedList":
      return renderListItems(node, (index) => `${index + 1}. `);
    case "listItem":
      return renderChildren(node, "");
    case "table":
      return renderChildren(node, "\n");
    case "tableRow":
      return renderChildren(node, " | ");
    case "tableCell":
    case "tableHeader":
      return renderChildren(node, "");
    case "mention":
      return typeof node.attrs?.text === "string" ? node.attrs.text : "@mention";
    case "emoji":
      return typeof node.attrs?.text === "string"
        ? node.attrs.text
        : typeof node.attrs?.shortName === "string"
          ? node.attrs.shortName
          : "";
    case "inlineCard":
    case "blockCard":
      return typeof node.attrs?.url === "string" ? node.attrs.url : "";
    case "doc":
      return renderChildren(node, "\n\n");
    default:
      // Unknown/unsupported node types (media, panels, extensions, …):
      // best-effort recurse into children rather than dropping content.
      return renderChildren(node, " ");
  }
}

/**
 * Converts a Jira `description`/comment-body field to plain text.
 * Accepts a plain string (passed through, trimmed), an ADF document
 * object, `null`/`undefined` (returns `null`), or anything else
 * unrecognised (also returns `null` rather than throwing — untrusted
 * external content, per ADR on treating Jira/repository text as
 * untrusted input).
 */
export function adfToPlainText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (!isAdfNode(value)) {
    return null;
  }

  const rendered = renderAdfNode(value)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return rendered || null;
}
