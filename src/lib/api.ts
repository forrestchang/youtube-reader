import { env } from "node:process";

export const DEFAULT_API_URL = "https://www.youtube-transcript.io/api/transcripts";

export type TranscriptResponse = unknown;

export async function fetchTranscripts(
  ids: string[],
  token: string,
  apiUrl: string = DEFAULT_API_URL
): Promise<TranscriptResponse> {
  if (!token) {
    throw new Error("Missing API token. Set YOUTUBE_TRANSCRIPT_API_TOKEN or use --token.");
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${token}`
    },
    body: JSON.stringify({ ids })
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const detail = isJson ? JSON.stringify(payload) : String(payload);
    throw new Error(`API request failed (${response.status} ${response.statusText}): ${detail}`);
  }

  return payload as TranscriptResponse;
}

export function resolveApiUrl(cliValue?: string): string {
  return cliValue?.trim() || env.YOUTUBE_TRANSCRIPT_API_URL?.trim() || DEFAULT_API_URL;
}

export function resolveApiToken(cliValue?: string): string {
  return cliValue?.trim() || env.YOUTUBE_TRANSCRIPT_API_TOKEN?.trim() || "";
}
