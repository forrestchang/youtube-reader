import { test } from "node:test";
import { strict as assert } from "node:assert";
import { extractVideoId } from "../lib/youtube";

test("extractVideoId accepts a raw 11-character video id", () => {
  assert.equal(extractVideoId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("extractVideoId handles youtube.com watch URL", () => {
  assert.equal(
    extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "dQw4w9WgXcQ"
  );
});

test("extractVideoId handles youtu.be short URL", () => {
  assert.equal(extractVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("extractVideoId handles embed / shorts / live paths", () => {
  assert.equal(
    extractVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"),
    "dQw4w9WgXcQ"
  );
  assert.equal(
    extractVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    "dQw4w9WgXcQ"
  );
  assert.equal(
    extractVideoId("https://www.youtube.com/live/dQw4w9WgXcQ"),
    "dQw4w9WgXcQ"
  );
});

test("extractVideoId rejects non-YouTube domains", () => {
  assert.equal(extractVideoId("https://example.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(extractVideoId("https://vimeo.com/123456789"), null);
  assert.equal(extractVideoId("https://www.youtube.com/watch?v=short"), null);
});

test("extractVideoId rejects empty or invalid input", () => {
  assert.equal(extractVideoId(""), null);
  assert.equal(extractVideoId("   "), null);
  assert.equal(extractVideoId("not-a-url"), null);
});
