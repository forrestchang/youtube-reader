export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Accept raw video id
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname;

  if (host === "youtu.be") {
    const id = path.split("/").filter(Boolean)[0];
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }

  if (host.endsWith("youtube.com")) {
    const vParam = url.searchParams.get("v");
    if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) return vParam;

    const parts = path.split("/").filter(Boolean);
    const index = parts.findIndex((p) => ["embed", "shorts", "live"].includes(p));
    if (index >= 0 && parts[index + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[index + 1])) {
      return parts[index + 1];
    }
  }

  return null;
}
