import { resolveApiToken, resolveApiUrl } from "../api";
import { hasYtdlp, detectWhisper, type WhisperBackend } from "../tools";
import { ApiProvider } from "./api";
import { YtdlpProvider } from "./ytdlp";
import { WhisperProvider } from "./whisper";

export type TranscriptSource = "api" | "ytdlp" | "whisper";

export interface TranscriptResult {
  text: string;
  title?: string;
  language?: string;
  source: TranscriptSource;
}

export interface TranscriptProvider {
  name: string;
  available(): Promise<boolean>;
  fetch(videoId: string): Promise<TranscriptResult | null>;
}

export interface ProviderOptions {
  token?: string;
  apiUrl?: string;
  provider?: "api" | "ytdlp" | "whisper" | "auto";
  whisperModel?: string;
  lang?: string;
  noFallback?: boolean;
}

interface ResolvedProviders {
  providers: TranscriptProvider[];
  warnings: string[];
}

/**
 * Resolve which providers to use based on options and availability
 */
export async function resolveProviders(options: ProviderOptions): Promise<ResolvedProviders> {
  const warnings: string[] = [];
  const providers: TranscriptProvider[] = [];

  const token = resolveApiToken(options.token);
  const apiUrl = resolveApiUrl(options.apiUrl);
  const ytdlpAvailable = await hasYtdlp();
  const whisperBackend = await detectWhisper();

  // If specific provider is requested
  if (options.provider && options.provider !== "auto") {
    switch (options.provider) {
      case "api":
        if (!token) {
          throw new Error(
            "API provider requires a token. Set YOUTUBE_TRANSCRIPT_API_TOKEN or use --token."
          );
        }
        providers.push(new ApiProvider(token, apiUrl));
        break;

      case "ytdlp":
        if (!ytdlpAvailable) {
          throw new Error(
            "yt-dlp provider requested but yt-dlp is not installed.\n" +
              "Install it with: brew install yt-dlp"
          );
        }
        providers.push(new YtdlpProvider(options.lang));
        break;

      case "whisper":
        if (!ytdlpAvailable) {
          throw new Error(
            "Whisper provider requires yt-dlp for audio download.\n" +
              "Install it with: brew install yt-dlp"
          );
        }
        if (!whisperBackend) {
          throw new Error(
            "Whisper provider requested but no whisper backend is available.\n" +
              "Install one of:\n" +
              "  - whisper.cpp: brew install whisper-cpp\n" +
              "  - OpenAI whisper: pip install openai-whisper\n" +
              "  - MLX whisper: pip install mlx-whisper\n" +
              "  - Or set OPENAI_API_KEY for API transcription"
          );
        }
        providers.push(new WhisperProvider(whisperBackend, options.whisperModel, options.lang));
        break;
    }

    return { providers, warnings };
  }

  // Auto mode: build provider chain with fallback
  if (token) {
    providers.push(new ApiProvider(token, apiUrl));
  }

  if (ytdlpAvailable) {
    providers.push(new YtdlpProvider(options.lang));

    if (whisperBackend) {
      providers.push(new WhisperProvider(whisperBackend, options.whisperModel, options.lang));
    }
  }

  if (providers.length === 0) {
    throw new Error(
      "No transcript provider available.\n\n" +
        "To fix this, either:\n" +
        "  - Set YOUTUBE_TRANSCRIPT_API_TOKEN for API access\n" +
        "  - Install yt-dlp: brew install yt-dlp\n" +
        "  - Install whisper: pip install openai-whisper"
    );
  }

  // Add warnings about missing fallbacks
  if (!token) {
    warnings.push("No API token set. Using yt-dlp for subtitles.");
  }
  if (!ytdlpAvailable && token) {
    warnings.push("yt-dlp not found. No fallback if API fails.");
  }
  if (ytdlpAvailable && !whisperBackend) {
    warnings.push("No whisper backend found. Cannot transcribe videos without subtitles.");
  }

  return { providers, warnings };
}

/**
 * Fetch transcript using provider chain with fallback
 */
export async function fetchTranscript(
  videoId: string,
  providers: TranscriptProvider[],
  noFallback?: boolean
): Promise<TranscriptResult> {
  const errors: Array<{ provider: string; error: Error }> = [];

  for (const provider of providers) {
    try {
      const isAvailable = await provider.available();
      if (!isAvailable) {
        continue;
      }

      const result = await provider.fetch(videoId);
      if (result) {
        return result;
      }

      // Provider returned null (no transcript available from this source)
      if (noFallback) {
        throw new Error(`[${provider.name}] No transcript available for video ${videoId}`);
      }
    } catch (error) {
      errors.push({
        provider: provider.name,
        error: error instanceof Error ? error : new Error(String(error))
      });

      if (noFallback) {
        throw error;
      }

      // Continue to next provider
      process.stderr.write(`[${provider.name}] ${errors[errors.length - 1].error.message}\n`);
    }
  }

  // All providers failed
  const errorDetails = errors
    .map((e) => `  - ${e.provider}: ${e.error.message}`)
    .join("\n");

  throw new Error(
    `Failed to get transcript for video ${videoId}.\n` +
      `Tried ${providers.length} provider(s):\n${errorDetails}`
  );
}
