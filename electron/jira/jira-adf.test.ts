import test from "node:test";
import assert from "node:assert/strict";
import { adfToPlainText } from "./jira-adf";

test("adfToPlainText passes a plain string through, trimmed", () => {
  assert.equal(adfToPlainText("  hello world  "), "hello world");
});

test("adfToPlainText returns null for null, undefined, empty string, and unrecognised values", () => {
  assert.equal(adfToPlainText(null), null);
  assert.equal(adfToPlainText(undefined), null);
  assert.equal(adfToPlainText(""), null);
  assert.equal(adfToPlainText(42), null);
});

test("adfToPlainText renders paragraphs and bold/plain text runs", () => {
  const doc = {
    content: [
      {
        content: [{ text: "Hello ", type: "text" }, { text: "world", type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  };
  assert.equal(adfToPlainText(doc), "Hello world");
});

test("adfToPlainText separates paragraphs with a blank line", () => {
  const doc = {
    content: [
      { content: [{ text: "First", type: "text" }], type: "paragraph" },
      { content: [{ text: "Second", type: "text" }], type: "paragraph" },
    ],
    type: "doc",
  };
  assert.equal(adfToPlainText(doc), "First\n\nSecond");
});

test("adfToPlainText renders bullet and ordered lists with markers", () => {
  const doc = {
    content: [
      {
        content: [
          { content: [{ content: [{ text: "one", type: "text" }], type: "paragraph" }], type: "listItem" },
          { content: [{ content: [{ text: "two", type: "text" }], type: "paragraph" }], type: "listItem" },
        ],
        type: "bulletList",
      },
    ],
    type: "doc",
  };
  assert.equal(adfToPlainText(doc), "- one\n- two");
});

test("adfToPlainText renders a hard break as a newline and a rule as a separator", () => {
  const doc = {
    content: [
      {
        content: [
          { text: "line one", type: "text" },
          { type: "hardBreak" },
          { text: "line two", type: "text" },
        ],
        type: "paragraph",
      },
    ],
    type: "doc",
  };
  assert.equal(adfToPlainText(doc), "line one\nline two");
});

test("adfToPlainText falls back to a placeholder for mentions without attrs.text", () => {
  const doc = {
    content: [{ content: [{ attrs: {}, type: "mention" }], type: "paragraph" }],
    type: "doc",
  };
  assert.equal(adfToPlainText(doc), "@mention");
});

test("adfToPlainText degrades unrecognised node types by recursing into children", () => {
  const doc = {
    content: [
      {
        content: [{ content: [{ text: "panel body", type: "text" }], type: "paragraph" }],
        type: "panel",
      },
    ],
    type: "doc",
  };
  assert.equal(adfToPlainText(doc), "panel body");
});
