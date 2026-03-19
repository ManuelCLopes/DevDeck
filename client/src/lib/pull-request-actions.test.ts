import test from "node:test";
import assert from "node:assert/strict";
import { parseReviewerLogins } from "./pull-request-actions";

test("parseReviewerLogins normalizes separators, trims @, and de-duplicates", () => {
  assert.deepEqual(
    parseReviewerLogins(" @manuel, teammate  manuel\nreviewer-two "),
    ["manuel", "teammate", "reviewer-two"],
  );
});

test("parseReviewerLogins ignores empty values", () => {
  assert.deepEqual(parseReviewerLogins(" ,   \n"), []);
});
