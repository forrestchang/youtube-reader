import { test } from "node:test";
import { strict as assert } from "node:assert";
import { extractTranscriptItems } from "../lib/normalize";

test("extractTranscriptItems returns [] for null / undefined", () => {
  assert.deepEqual(extractTranscriptItems(null), []);
  assert.deepEqual(extractTranscriptItems(undefined), []);
});

test("extractTranscriptItems handles a plain string", () => {
  const items = extractTranscriptItems("hello world");
  assert.equal(items.length, 1);
  assert.equal(items[0].text, "hello world");
});

test("extractTranscriptItems trims and skips empty strings", () => {
  const items = extractTranscriptItems("   ");
  assert.equal(items.length, 0);
});

test("extractTranscriptItems maps an array of strings to one item each", () => {
  const items = extractTranscriptItems(["a", "b"]);
  assert.equal(items.length, 2);
  assert.equal(items[0].text, "a");
  assert.equal(items[1].text, "b");
});

test("extractTranscriptItems extracts from a transcripts key", () => {
  const payload = {
    transcripts: [{ text: "first" }, { text: "second" }]
  };
  const items = extractTranscriptItems(payload);
  assert.equal(items.length, 2);
  assert.equal(items[0].text, "first");
  assert.equal(items[1].text, "second");
});

test("extractTranscriptItems extracts nested text from objects", () => {
  const payload = {
    data: {
      segments: [{ text: "nested one" }, { text: "nested two" }]
    }
  };
  const items = extractTranscriptItems(payload);
  assert.equal(items.length, 1);
  assert.ok(items[0].text!.includes("nested one"));
  assert.ok(items[0].text!.includes("nested two"));
});

test("extractTranscriptItems returns [] for unshaped payloads", () => {
  assert.deepEqual(extractTranscriptItems({}), []);
  assert.deepEqual(extractTranscriptItems([{}]), []);
});
