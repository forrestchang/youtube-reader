import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasYtdlp } from "../tools";
import { parseVtt, parseSrt, parseTtml } from "../subtitles";
import type { TranscriptProvider, TranscriptResult } from "./index";

const execFileAsync = promisify(execFile);

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
      //
      // NOTE: arguments are passed as a vector to execFile (no shell involved),
      // which prevents command injection via the video id / language / output path.
      const args = [
        "yt-dlp",
        "--write-sub",
        "--write-auto-sub",
        "--sub-lang",
        langPref,
        "--sub-format",
        "vtt/srt/best",
        "--skip-download",
        "--ignore-errors",
        "--print-json",
        "-o",
        join(tempDir, "%(id)s"),
        url
      ];

      let stdout: string;
      try {
        const result = await execFileAsync(args[0], args.slice(1), {
          maxBuffer: 10 * 1024 * 1024
        });
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
