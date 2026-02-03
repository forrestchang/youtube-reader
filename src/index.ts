#!/usr/bin/env node
import "dotenv/config";

import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import { buildArticle } from "./lib/article";
import { extractVideoId } from "./lib/youtube";
import { summarizeTranscript } from "./lib/summarize";
import {
  resolveProviders,
  fetchTranscript,
  type ProviderOptions,
  type TranscriptResult
} from "./lib/providers";

const program = new Command();

program
  .name("youtube-reader")
  .description("Turn YouTube transcripts into readable articles")
  .argument("<urlOrId...>", "YouTube URL(s) or video ID(s)")
  .option("-t, --token <token>", "API token (overrides env)")
  .option("-a, --api <url>", "API endpoint override")
  .option("-o, --out <file>", "Write output to a file (single input only)")
  .option("--raw", "Output raw transcript text instead of formatted article")
  .option("--json", "Output result as JSON (includes source field)")
  .option("--paragraph-words <number>", "Target words per paragraph", parseNumber)
  .option("--title <title>", "Override the article title")
  .option(
    "--provider <name>",
    "Force specific provider (api|ytdlp|whisper|auto)",
    "auto"
  )
  .option("--whisper-model <model>", "Whisper model (tiny|base|small|medium|large)", "base")
  .option("--lang <code>", "Preferred language code (en|zh|...)")
  .option("--no-fallback", "Disable fallback, only use first available provider")
  .option("--summarize", "Summarize transcript into a structured article using AI")
  .option("--model <model>", "AI model for summarization (default: gpt-4o)", "gpt-4o")
  .parse(process.argv);

const inputs = program.args as string[];
const options = program.opts<{
  token?: string;
  api?: string;
  out?: string;
  raw?: boolean;
  json?: boolean;
  paragraphWords?: number;
  title?: string;
  provider?: "api" | "ytdlp" | "whisper" | "auto";
  whisperModel?: string;
  lang?: string;
  fallback?: boolean;
  summarize?: boolean;
  model?: string;
}>();

async function main() {
  if (!inputs.length) {
    program.help({ error: true });
  }

  if (options.out && inputs.length > 1) {
    throw new Error("--out supports a single input only. Use one URL/ID at a time.");
  }

  const ids = inputs
    .map((input) => ({ input, id: extractVideoId(input) }))
    .filter((entry) => entry.id);

  if (ids.length !== inputs.length) {
    const invalid = inputs.filter((input) => !extractVideoId(input));
    throw new Error(`Invalid YouTube URL or ID: ${invalid.join(", ")}`);
  }

  // Resolve providers based on options and availability
  const providerOptions: ProviderOptions = {
    token: options.token,
    apiUrl: options.api,
    provider: options.provider,
    whisperModel: options.whisperModel,
    lang: options.lang,
    noFallback: options.fallback === false
  };

  const { providers, warnings } = await resolveProviders(providerOptions);

  // Show warnings
  for (const warning of warnings) {
    process.stderr.write(`Warning: ${warning}\n`);
  }

  // Fetch transcripts for all videos
  const results: Array<{ id: string; result: TranscriptResult }> = [];

  for (const entry of ids) {
    const videoId = entry.id as string;
    const result = await fetchTranscript(videoId, providers, options.fallback === false);
    results.push({ id: videoId, result });
  }

  // Output results
  if (options.json) {
    const jsonOutput = results.map(({ id, result }) => ({
      id,
      title: result.title,
      text: result.text,
      language: result.language,
      source: result.source
    }));

    await output(JSON.stringify(results.length === 1 ? jsonOutput[0] : jsonOutput, null, 2));
    return;
  }

  const outputBlocks: string[] = [];

  for (const { id, result } of results) {
    const sourceUrl = `https://www.youtube.com/watch?v=${id}`;
    const title = options.title || result.title || `Video ${id}`;

    if (options.raw) {
      outputBlocks.push(result.text.trim() + "\n");
    } else if (options.summarize) {
      const summary = await summarizeTranscript(result.text, {
        title,
        url: sourceUrl,
        model: options.model
      });
      outputBlocks.push(summary.trim() + "\n");
    } else {
      outputBlocks.push(
        buildArticle(result.text, {
          title,
          sourceUrl,
          paragraphWords: options.paragraphWords
        })
      );
    }
  }

  await output(joinBlocks(outputBlocks));
}

function parseNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("--paragraph-words must be a positive number");
  }
  return Math.floor(parsed);
}

function joinBlocks(blocks: string[]): string {
  if (blocks.length <= 1) return blocks[0] ?? "";
  return blocks.join("\n---\n\n");
}

async function output(content: string): Promise<void> {
  if (options.out) {
    await writeFile(options.out, content, "utf-8");
  } else {
    process.stdout.write(content);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
