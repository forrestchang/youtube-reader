import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rm, mkdtemp, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { hasYtdlp, detectWhisper, type WhisperBackend } from "../tools";
import type { TranscriptProvider, TranscriptResult } from "./index";

const execAsync = promisify(exec);

export class WhisperProvider implements TranscriptProvider {
  name = "whisper";
  private backend: WhisperBackend;
  private model: string;
  private lang?: string;

  constructor(backend: WhisperBackend, model?: string, lang?: string) {
    this.backend = backend;
    this.model = model || "base";
    this.lang = lang;
  }

  async available(): Promise<boolean> {
    const ytdlp = await hasYtdlp();
    if (!ytdlp) return false;

    const whisper = await detectWhisper();
    return whisper !== null;
  }

  async fetch(videoId: string): Promise<TranscriptResult | null> {
    const tempDir = await mkdtemp(join(tmpdir(), "ytbr-whisper-"));

    try {
      const url = `https://www.youtube.com/watch?v=${videoId}`;

      process.stderr.write(`[whisper] Downloading audio for ${videoId}...\n`);

      // Download audio using yt-dlp
      const audioPath = join(tempDir, `${videoId}.mp3`);
      const downloadCmd = [
        "yt-dlp",
        "-x",
        "--audio-format mp3",
        "--audio-quality 5", // Lower quality for faster download
        "--no-warnings",
        "--print-json",
        `-o "${join(tempDir, "%(id)s.%(ext)s")}"`,
        `"${url}"`
      ].join(" ");

      const { stdout: downloadOutput } = await execAsync(downloadCmd, {
        maxBuffer: 10 * 1024 * 1024
      });

      // Parse JSON for title
      let title: string | undefined;
      try {
        const info = JSON.parse(downloadOutput);
        title = info.title || info.fulltitle;
      } catch {
        // Continue without title
      }

      // Verify audio file exists
      try {
        await access(audioPath);
      } catch {
        throw new Error("Failed to download audio file");
      }

      process.stderr.write(`[whisper] Transcribing with ${this.backend.type}...\n`);

      // Transcribe based on backend
      let text: string;
      switch (this.backend.type) {
        case "whisper-cpp":
          text = await this.runWhisperCpp(audioPath, tempDir);
          break;
        case "whisper":
          text = await this.runWhisperCli(audioPath, tempDir);
          break;
        case "mlx-whisper":
          text = await this.runMlxWhisper(audioPath, tempDir);
          break;
        case "openai-api":
          text = await this.runWhisperApi(audioPath);
          break;
        default:
          throw new Error(`Unknown whisper backend: ${(this.backend as WhisperBackend).type}`);
      }

      if (!text.trim()) {
        return null;
      }

      return {
        text: text.trim(),
        title,
        language: this.lang,
        source: "whisper"
      };
    } finally {
      // Cleanup temp directory
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async runWhisperCpp(audioPath: string, tempDir: string): Promise<string> {
    const outputBase = join(tempDir, "output");
    const args = [
      `-m "${this.getModelPath("whisper-cpp")}"`,
      `-f "${audioPath}"`,
      `-otxt`,
      `-of "${outputBase}"`
    ];

    if (this.lang) {
      args.push(`-l ${this.lang}`);
    }

    const cmd = `${this.backend.type === "whisper-cpp" ? (this.backend as { path: string }).path : "whisper"} ${args.join(" ")}`;

    await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });

    // Read output file
    const outputPath = `${outputBase}.txt`;
    try {
      return await readFile(outputPath, "utf-8");
    } catch {
      throw new Error("Whisper.cpp failed to produce output");
    }
  }

  private async runWhisperCli(audioPath: string, tempDir: string): Promise<string> {
    const args = [
      `"${audioPath}"`,
      `--model ${this.model}`,
      `--output_dir "${tempDir}"`,
      "--output_format txt"
    ];

    if (this.lang) {
      args.push(`--language ${this.lang}`);
    }

    const cmd = `${(this.backend as { path: string }).path} ${args.join(" ")}`;

    await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });

    // Find output file (whisper names it based on input)
    const outputPath = audioPath.replace(/\.[^.]+$/, ".txt");
    try {
      return await readFile(outputPath, "utf-8");
    } catch {
      throw new Error("Whisper CLI failed to produce output");
    }
  }

  private async runMlxWhisper(audioPath: string, tempDir: string): Promise<string> {
    const args = [`"${audioPath}"`, `--model ${this.model}`, `--output-dir "${tempDir}"`];

    if (this.lang) {
      args.push(`--language ${this.lang}`);
    }

    const cmd = `${(this.backend as { path: string }).path} ${args.join(" ")}`;

    await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });

    // Find output file
    const outputPath = audioPath.replace(/\.[^.]+$/, ".txt");
    try {
      return await readFile(outputPath, "utf-8");
    } catch {
      throw new Error("MLX Whisper failed to produce output");
    }
  }

  private async runWhisperApi(audioPath: string): Promise<string> {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required for OpenAI Whisper API");
    }

    // Use curl to call OpenAI API
    const cmd = [
      "curl -s",
      "https://api.openai.com/v1/audio/transcriptions",
      `-H "Authorization: Bearer ${apiKey}"`,
      `-F "model=whisper-1"`,
      `-F "file=@${audioPath}"`,
      this.lang ? `-F "language=${this.lang}"` : ""
    ]
      .filter(Boolean)
      .join(" ");

    const { stdout } = await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });

    try {
      const response = JSON.parse(stdout);
      if (response.error) {
        throw new Error(response.error.message || "OpenAI API error");
      }
      return response.text || "";
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`OpenAI API returned invalid JSON: ${stdout.slice(0, 200)}`);
      }
      throw error;
    }
  }

  private getModelPath(backendType: string): string {
    // Default model paths for whisper.cpp
    // Users can override by setting WHISPER_MODEL_PATH
    const customPath = env.WHISPER_MODEL_PATH;
    if (customPath) return customPath;

    // Common installation locations
    const modelName = `ggml-${this.model}.bin`;
    const commonPaths = [
      `/usr/local/share/whisper/${modelName}`,
      `/opt/homebrew/share/whisper/${modelName}`,
      `${env.HOME}/.local/share/whisper/${modelName}`,
      `${env.HOME}/whisper.cpp/models/${modelName}`
    ];

    // For simplicity, return the first common path
    // The actual binary will handle model loading
    return commonPaths[0];
  }
}
