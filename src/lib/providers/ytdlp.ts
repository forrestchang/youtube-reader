import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasYtdlp } from "../tools";
import type { TranscriptProvider, TranscriptResult } from "./index";

const execAsync = promisify(exec);

export class YtdlpProvider implements TranscriptProvider {
  name = "ytdlp";
  private preferredLang?: string;

  constructor(preferredLang?: string) {
    this.preferredLang = preferredLang;
  }

  async available(): Promise<boolean> {
    return hasYtdlp();
  }

  async fetch(videoId: string): Promise<TranscriptResult | null> {
    const tempDir = await mkdtemp(join(tmpdir(), "ytbr-"));

    try {
      const url = `https://www.youtube.com/watch?v=${videoId}`;

      // Build language preference string - use simpler list to avoid rate limits
      const langPref = this.preferredLang || "en";

      // Download subtitles (prefer manual, fallback to auto-generated)
      // Use --ignore-errors to continue even if some subtitles fail
      const cmd = [
        "yt-dlp",
        "--write-sub",
        "--write-auto-sub",
        `--sub-lang "${langPref}"`,
        "--sub-format vtt/srt/best",
        "--skip-download",
        "--ignore-errors",
        "--print-json",
        `-o "${join(tempDir, "%(id)s")}"`,
        `"${url}"`
      ].join(" ");

      let stdout: string;
      try {
        const result = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
        stdout = result.stdout;
      } catch (error) {
        // yt-dlp may exit with error even if subtitles were downloaded
        // Check if we got any output before failing
        const execError = error as { stdout?: string; stderr?: string };
        if (execError.stdout) {
          stdout = execError.stdout;
        } else {
          throw error;
        }
      }

      // Parse JSON output for video info
      let title: string | undefined;
      let detectedLang: string | undefined;

      try {
        const info = JSON.parse(stdout);
        title = info.title || info.fulltitle;

        // Try to detect which subtitle was downloaded
        if (info.requested_subtitles) {
          const subtitleLangs = Object.keys(info.requested_subtitles);
          if (subtitleLangs.length > 0) {
            detectedLang = subtitleLangs[0];
          }
        }
      } catch {
        // JSON parsing failed, continue without metadata
      }

      // Find the subtitle file
      const files = await readdir(tempDir);
      const subtitleFile = files.find(
        (f) => f.endsWith(".vtt") || f.endsWith(".srt") || f.endsWith(".ttml")
      );

      if (!subtitleFile) {
        return null; // No subtitles available
      }

      // Read and parse subtitle file
      const subtitlePath = join(tempDir, subtitleFile);
      const content = await readFile(subtitlePath, "utf-8");

      // Detect format and parse
      const text = subtitleFile.endsWith(".vtt")
        ? parseVtt(content)
        : subtitleFile.endsWith(".srt")
          ? parseSrt(content)
          : parseTtml(content);

      if (!text.trim()) {
        return null;
      }

      return {
        text: text.trim(),
        title,
        language: detectedLang,
        source: "ytdlp"
      };
    } finally {
      // Cleanup temp directory
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Parse VTT (WebVTT) subtitle format
 * Handles YouTube's auto-generated subtitles which have duplicate lines
 */
function parseVtt(content: string): string {
  const lines: string[] = [];
  const seenLines = new Set<string>();

  // Split into cue blocks
  const blocks = content.split(/\n\n+/);

  for (const block of blocks) {
    const blockLines = block.split("\n");

    for (const line of blockLines) {
      // Skip header, timestamps, and metadata
      if (
        line.startsWith("WEBVTT") ||
        line.startsWith("Kind:") ||
        line.startsWith("Language:") ||
        line.startsWith("NOTE") ||
        /^\d+$/.test(line.trim()) ||
        /^\d{2}:\d{2}/.test(line) ||
        /-->/.test(line)
      ) {
        continue;
      }

      // Clean the line
      let cleaned = cleanSubtitleLine(line);
      if (!cleaned) continue;

      // Deduplicate (YouTube auto-subs repeat lines)
      if (!seenLines.has(cleaned)) {
        seenLines.add(cleaned);
        lines.push(cleaned);
      }
    }
  }

  return lines.join(" ");
}

/**
 * Parse SRT subtitle format
 */
function parseSrt(content: string): string {
  const lines: string[] = [];
  const seenLines = new Set<string>();

  // Split into cue blocks
  const blocks = content.split(/\n\n+/);

  for (const block of blocks) {
    const blockLines = block.split("\n");

    for (const line of blockLines) {
      // Skip sequence numbers and timestamps
      if (/^\d+$/.test(line.trim()) || /-->/.test(line)) {
        continue;
      }

      let cleaned = cleanSubtitleLine(line);
      if (!cleaned) continue;

      if (!seenLines.has(cleaned)) {
        seenLines.add(cleaned);
        lines.push(cleaned);
      }
    }
  }

  return lines.join(" ");
}

/**
 * Parse TTML subtitle format (XML-based)
 */
function parseTtml(content: string): string {
  const lines: string[] = [];
  const seenLines = new Set<string>();

  // Extract text content between <p> tags
  const matches = content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);

  for (const match of matches) {
    let text = match[1];

    // Remove XML tags
    text = text.replace(/<[^>]+>/g, " ");

    // Clean and process
    const cleaned = cleanSubtitleLine(text);
    if (!cleaned) continue;

    if (!seenLines.has(cleaned)) {
      seenLines.add(cleaned);
      lines.push(cleaned);
    }
  }

  return lines.join(" ");
}

/**
 * Clean a single subtitle line
 */
function cleanSubtitleLine(line: string): string {
  let cleaned = line;

  // Remove VTT positioning/styling tags
  cleaned = cleaned.replace(/<\/?c[^>]*>/g, "");
  cleaned = cleaned.replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "");
  cleaned = cleaned.replace(/<[^>]+>/g, "");

  // Remove HTML entities
  cleaned = cleaned.replace(/&nbsp;/g, " ");
  cleaned = cleaned.replace(/&amp;/g, "&");
  cleaned = cleaned.replace(/&lt;/g, "<");
  cleaned = cleaned.replace(/&gt;/g, ">");
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&#39;/g, "'");

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // Skip lines that are just music notation or speaker labels
  if (/^\[.*\]$/.test(cleaned) || /^♪.*♪$/.test(cleaned)) {
    return "";
  }

  // Remove music notation markers
  cleaned = cleaned.replace(/♪/g, "").trim();

  return cleaned;
}
