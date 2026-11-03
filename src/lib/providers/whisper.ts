import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rm, mkdtemp, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { hasYtdlp, detectWhisper, type WhisperBackend } from "../tools";
import type { TranscriptProvider, TranscriptResult } from "./index";

const execFileAsync = promisify(execFile);

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
      const downloadArgs = [
        "yt-dlp",
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "5", // Lower quality for faster download
        "--no-warnings",
        "--print-json",
        "-o",
        join(tempDir, "%(id)s.%(ext)s"),
        url
      ];

      const { stdout: downloadOutput } = await execFileAsync(downloadArgs[0], downloadArgs.slice(1), {
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
          throw new Error(
            `Unknown whisper backend: ${(this.backend as WhisperBackend).type}`
          );
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
    const exe = (this.backend as { path: string }).path;
    const args = [
      "-m",
      await this.getModelPath("whisper-cpp"),
      "-f",
      audioPath,
      "-otxt",
      "-of",
      outputBase,
      ...(this.lang ? ["-l", this.lang] : [])
    ];

    await execFileAsync(exe, args, { maxBuffer: 50 * 1024 * 1024 });

    // Read output file
    const outputPath = `${outputBase}.txt`;
    try {
      return await readFile(outputPath, "utf-8");
    } catch {
      throw new Error("Whisper.cpp failed to produce output");
    }
  }

  private async runWhisperCli(audioPath: string, tempDir: string): Promise<string> {
    const exe = (this.backend as { path: string }).path;
    const args = [
      audioPath,
      "--model",
      this.model,
      "--output_dir",
      tempDir,
      "--output_format",
      "txt",
      ...(this.lang ? ["--language", this.lang] : [])
    ];

    await execFileAsync(exe, args, { maxBuffer: 50 * 1024 * 1024 });

    // Find output file (whisper names it based on input)
    const outputPath = audioPath.replace(/\.[^.]+$/, ".txt");
    try {
      return await readFile(outputPath, "utf-8");
    } catch {
      throw new Error("Whisper CLI failed to produce output");
    }
  }

  private async runMlxWhisper(audioPath: string, tempDir: string): Promise<string> {
    const exe = (this.backend as { path: string }).path;
    const args = [
      audioPath,
      "--model",
      this.model,
      "--output-dir",
      tempDir,
      ...(this.lang ? ["--language", this.lang] : [])
    ];

    await execFileAsync(exe, args, { maxBuffer: 50 * 1024 * 1024 });

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

    // Use fetch + FormData instead of curl so OPENAI_API_KEY is only sent in the
    // Authorization header and never appears in the process list.
    const audioBuffer = await readFile(audioPath);
    const audioBlob = new Blob([audioBuffer]);
    const formData = new FormData();
    formData.append("model", "whisper-1");
    formData.append("file", audioBlob, `${videoId(audioPath)}.mp3`);
    if (this.lang) {
      formData.append("language", this.lang);
    }

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    });

    const stdout = await response.text();

    try {
      const responseJson = JSON.parse(stdout);
      if (responseJson.error) {
        throw new Error(responseJson.error.message || "OpenAI API error");
      }
      return responseJson.text || "";
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `OpenAI API returned invalid JSON: ${stdout.slice(0, 200)}`
        );
      }
      throw error;
    }
  }

  private async getModelPath(backendType: string): Promise<string> {
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

    // Check actual file existence and return the first available model path
    for (const candidate of commonPaths) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        // keep looking
      }
    }

    // Fallback: let the underlying binary handle model loading
    return commonPaths[0];
  }
}

function videoId(audioPath: string): string {
  return audioPath.split("/").pop()?.replace(/\.[^.]+$/, "") || "audio";
}
