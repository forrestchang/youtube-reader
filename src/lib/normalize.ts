export type TranscriptItem = {
  id?: string;
  title?: string;
  text: string;
};

export function extractTranscriptItems(payload: unknown): TranscriptItem[] {
  if (payload == null) return [];

  if (typeof payload === "string") {
    return payload.trim() ? [{ text: payload.trim() }] : [];
  }

  if (Array.isArray(payload)) {
    const fromEntries = payload.flatMap((entry) => itemFromEntry(entry));
    if (fromEntries.length > 0) return fromEntries;

    const text = extractTextFromUnknown(payload);
    return text ? [{ text }] : [];
  }

  if (typeof payload === "object") {
    const obj = payload as Record<string, unknown>;

    const collectionKeys = ["transcripts", "results", "data", "items"];
    for (const key of collectionKeys) {
      const value = obj[key];
      if (Array.isArray(value)) {
        const items = value.flatMap((entry) => itemFromEntry(entry));
        if (items.length > 0) return items;
      }
    }

    const directText = extractTextFromUnknown(obj);
    if (directText) return [{ text: directText }];
  }

  return [];
}

function itemFromEntry(entry: unknown): TranscriptItem[] {
  if (entry == null) return [];
  if (typeof entry === "string") return entry.trim() ? [{ text: entry.trim() }] : [];

  if (Array.isArray(entry)) {
    const text = extractTextFromUnknown(entry);
    return text ? [{ text }] : [];
  }

  if (typeof entry === "object") {
    const obj = entry as Record<string, unknown>;
    const title = firstString(obj, ["title", "video_title", "name"]);
    const id = firstString(obj, ["id", "video_id", "videoId"]);

    const text = extractTextFromUnknown(
      obj.transcript ?? obj.text ?? obj.segments ?? obj.captions ?? obj.items ?? obj.data
    );

    if (text) return [{ id: id || undefined, title: title || undefined, text }];
  }

  return [];
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function extractTextFromUnknown(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;

  if (Array.isArray(value)) {
    if (value.length === 0) return null;

    if (value.every((item) => typeof item === "string")) {
      const joined = value.map((item) => item.trim()).filter(Boolean).join(" ");
      return joined || null;
    }

    if (value.every((item) => typeof item === "object" && item !== null && "text" in item)) {
      const joined = value
        .map((item) => (item as Record<string, unknown>).text)
        .filter((text) => typeof text === "string")
        .map((text) => (text as string).trim())
        .filter(Boolean)
        .join(" ");
      return joined || null;
    }

    const fromEntries = value.map((item) => extractTextFromUnknown(item)).filter(Boolean) as string[];
    if (fromEntries.length > 0) return fromEntries.join(" ");
    return null;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    const direct = extractTextFromUnknown(obj.text ?? obj.transcript ?? obj.caption ?? obj.content);
    if (direct) return direct;

    const fallbackKeys = ["segments", "captions", "items", "data", "results", "transcripts"];
    for (const key of fallbackKeys) {
      const nested = extractTextFromUnknown(obj[key]);
      if (nested) return nested;
    }
  }

  return null;
}
