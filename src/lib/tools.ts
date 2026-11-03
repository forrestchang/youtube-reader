import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "node:process";

const execFileAsync = promisify(execFile);

const IS_WINDOWS = env.platform === "win32";

/**
 * Check if a command exists in PATH.
 * Cross-platform: uses `where` on Windows and `which` on Unix.
 * Uses execFile (no shell) to avoid command injection.
 */
async function commandExists(cmd: string): Promise<string | null> {
  const probe = IS_WINDOWS ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(probe, [cmd]);
    const lines = stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
    return lines[0]?.trim() || null;
  } catch {
    return null;
  }
}

export async function hasYtdlp(): Promise<boolean> {
  const path = await commandExists("yt-dlp");
  return path !== null;
}

export async function getYtdlpPath(): Promise<string | null> {
  return commandExists("yt-dlp");
}

export type WhisperBackend =
  | { type: "whisper-cpp"; path: string }
  | { type: "whisper"; path: string }
  | { type: "mlx-whisper"; path: string }
  | { type: "openai-api" };

/**
 * Detect available whisper backend
 * Priority: whisper.cpp > mlx-whisper > whisper CLI > OpenAI API
 */
export async function detectWhisper(): Promise<WhisperBackend | null> {
  // Check for whisper.cpp (often installed as 'whisper-cpp' or 'whisper')
  const whisperCppPath = await commandExists("whisper-cpp");
  if (whisperCppPath) {
    return { type: "whisper-cpp", path: whisperCppPath };
  }

  // Check for main binary from whisper.cpp (just 'whisper' is common)
  const mainPath = await commandExists("whisper");
  if (mainPath) {
    try {
      const { stdout } = await execFileAsync(mainPath, ["--help"]);
      if (stdout.includes("whisper.cpp")) {
        return { type: "whisper-cpp", path: mainPath };
      }
      // Otherwise it's likely openai-whisper
      return { type: "whisper", path: mainPath };
    } catch {
      // If help fails, assume it's openai-whisper
      return { type: "whisper", path: mainPath };
    }
  }

  // Check for MLX whisper (Apple Silicon optimized)
  const mlxWhisperPath = await commandExists("mlx_whisper");
  if (mlxWhisperPath) {
    return { type: "mlx-whisper", path: mlxWhisperPath };
  }

  // Check for OpenAI API availability
  if (env.OPENAI_API_KEY) {
    return { type: "openai-api" };
  }

  return null;
}

/**
 * Check if any whisper backend is available
 */
export async function hasWhisper(): Promise<boolean> {
  const backend = await detectWhisper();
  return backend !== null;
}
