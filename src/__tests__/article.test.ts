import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildArticle } from "../lib/article";

test("buildArticle renders title, source and paragraphs", () => {
  const text =
    "Hello world. This is a test sentence. Another sentence here. Final sentence.";
  const article = buildArticle(text, {
    title: "Test",
    sourceUrl: "https://www.youtube.com/watch?v=xyz"
  });

  assert.ok(article.includes("# Test"));
  assert.ok(article.includes("Source: https://www.youtube.com/watch?v=xyz"));
  assert.ok(article.includes("Hello world"));
  assert.ok(article.includes("Final sentence."));
});

test("buildArticle defaults title when not provided", () => {
  const article = buildArticle("Some text.");
  assert.ok(article.includes("# Transcript"));
});

test("buildArticle handles empty text", () => {
  const article = buildArticle("");
  assert.ok(article.includes("# Transcript"));
});
