import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseVtt, parseSrt, parseTtml } from "../lib/subtitles";

test("parseVtt extracts text and removes consecutive duplicates only", () => {
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
hello world

00:00:02.000 --> 00:00:03.000
hello world

00:00:03.000 --> 00:00:04.000
goodbye world`;
  const text = parseVtt(vtt);
  assert.equal(text, "hello world goodbye world");
});

test("parseVtt normalizes CRLF line endings", () => {
  const vtt = "WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nline one\r\n";
  const text = parseVtt(vtt);
  assert.ok(text.includes("line one"));
});

test("parseVtt skips headers, timestamps and styling tags", () => {
  const vtt = `WEBVTT
Kind: captions
Language: en

00:00:01.000 --> 00:00:02.000
<c>styled</c> text
00:00:02.000 --> 00:00:03.000
more text`;
  const text = parseVtt(vtt);
  assert.ok(text.includes("styled text"));
  assert.ok(text.includes("more text"));
  assert.ok(!text.includes("WEBVTT"));
  assert.ok(!text.includes("Kind:"));
});

test("parseSrt extracts text from numbered cues", () => {
  const srt = `1
00:00:01,000 --> 00:00:02,000
first line

2
00:00:02,000 --> 00:00:03,000
second line`;
  const text = parseSrt(srt);
  assert.ok(text.includes("first line"));
  assert.ok(text.includes("second line"));
  assert.ok(!text.includes("-->"));
});

test("parseTtml extracts text from p tags", () => {
  const ttml = `<tt><body><p>ttml one</p><p>ttml two</p></body></tt>`;
  const text = parseTtml(ttml);
  assert.ok(text.includes("ttml one"));
  assert.ok(text.includes("ttml two"));
});
