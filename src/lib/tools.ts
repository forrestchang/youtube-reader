import { exec } from "node:child_process";
import { promisify } from "node:util";
import { env } from "node:process";

const execAsync = promisify(exec);

export type WhisperBackend =
  | { type: "whisper-cpp"; path: string }
  | { type: "whisper"; path: string }
  | { type: "mlx-whisper"; path: string }
  | { type: "openai-api" };

/**
 * Check if a command exists in PATH
 */
async function commandExists(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`which ${cmd}`);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Check if yt-dlp is available
 */
export async function hasYtdlp(): Promise<boolean> {
  const path = await commandExists("yt-dlp");
  return path !== null;
}

/**
 * Get the path to yt-dlp if available
 */
export async function getYtdlpPath(): Promise<string | null> {
  return commandExists("yt-dlp");
}

/**
 * Detect available whisper backend
 * Priority: whisper.cpp > mlx-whisper > whisper CLI > OpenAI API
 */
export async function detectWhisper(): Promise<WhisperBackend | null> {
  // Check for whisper.cpp (often installed as 'whisper' or 'whisper-cpp')
  const whisperCppPath = await commandExists("whisper-cpp");
  if (whisperCppPath) {
    return { type: "whisper-cpp", path: whisperCppPath };
  }

  // Check for main binary from whisper.cpp (just 'main' is common)
  const mainPath = await commandExists("whisper");
  if (mainPath) {
    // Distinguish between whisper.cpp and openai-whisper by checking help output
    try {
      const { stdout } = await execAsync(`${mainPath} --help 2>&1`);
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
