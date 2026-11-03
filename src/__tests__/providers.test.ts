import { test } from "node:test";
import { strict as assert } from "node:assert";
import { fetchTranscript } from "../lib/providers";
import type { TranscriptProvider, TranscriptResult } from "../lib/providers";

function makeProvider(
  name: string,
  outcome: "ok" | "null" | "fail"
): TranscriptProvider {
  return {
    name,
    available: async () => true,
    fetch: async (_videoId: string): Promise<TranscriptResult | null> => {
      if (outcome === "fail") {
        throw new Error(`boom ${name}`);
      }
      if (outcome === "null") {
        return null;
      }
      return {
        text: `text from ${name}`,
        title: `t ${name}`,
        source: name as TranscriptResult["source"]
      };
    }
  };
}

test("fetchTranscript returns the first provider that succeeds", async () => {
  const providers = [
    makeProvider("a", "fail"),
    makeProvider("b", "ok"),
    makeProvider("c", "ok")
  ];
  const result = await fetchTranscript("vid1", providers);
  assert.equal(result.source, "b");
  assert.equal(result.text, "text from b");
});

test("fetchTranscript skips providers that return null", async () => {
  const providers = [makeProvider("a", "null"), makeProvider("b", "ok")];
  const result = await fetchTranscript("vid1", providers);
  assert.equal(result.source, "b");
});

test("fetchTranscript throws when all providers fail", async () => {
  const providers = [makeProvider("a", "fail"), makeProvider("b", "fail")];
  let threw = false;
  try {
    await fetchTranscript("vid1", providers);
  } catch {
    threw = true;
  }
  assert.ok(threw, "expected fetchTranscript to throw");
});
