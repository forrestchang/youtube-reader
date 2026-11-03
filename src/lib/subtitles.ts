/**
 * Subtitle parsers (VTT / SRT / TTML).
 *
 * Notes:
 * - CRLF (`\r\n`) is normalized to LF before parsing so cue blocks split
 *   correctly on every platform (Windows / Linux / macOS).
 * - Duplicate removal in VTT/SRT is consecutive-only: YouTube auto-generated
 *   subtitles repeat adjacent lines, but non-adjacent distinct lines are kept.
 */

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function cleanSubtitleLine(line: string): string {
  let cleaned = line;

  // Remove VTT positioning/styling tags
  cleaned = cleaned.replace(/<\/c[^>]*>/g, "");
  cleaned = cleaned.replace(/<c[^>]*>/g, "");
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

function collectLines(
  blocks: string[],
  consecutiveOnly: boolean
): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  let lastCleaned: string | null = null;

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

      const cleaned = cleanSubtitleLine(line);
      if (!cleaned) continue;

      if (consecutiveOnly) {
        // Remove consecutive duplicates only (YouTube auto-sub repetition)
        if (lastCleaned === cleaned) continue;
        lastCleaned = cleaned;
      } else {
        if (seen.has(cleaned)) continue;
        seen.add(cleaned);
      }

      lines.push(cleaned);
    }
  }

  return lines;
}

/**
 * Parse VTT (WebVTT) subtitle format
 */
export function parseVtt(content: string): string {
  const normalized = normalizeLineEndings(content);
  const blocks = normalized.split(/\n\n+/);
  const lines = collectLines(blocks, true);
  return lines.join(" ");
}

/**
 * Parse SRT subtitle format
 */
export function parseSrt(content: string): string {
  const normalized = normalizeLineEndings(content);
  const blocks = normalized.split(/\n\n+/);
  const lines = collectLines(blocks, true);
  return lines.join(" ");
}

/**
 * Parse TTML subtitle format (XML-based)
 */
export function parseTtml(content: string): string {
  const normalized = normalizeLineEndings(content);
  const lines: string[] = [];
  const seen = new Set<string>();

  const matches = normalized.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);

  for (const match of matches) {
    let text = match[1];

    // Remove XML tags
    text = text.replace(/<[^>]+>/g, " ");

    const cleaned = cleanSubtitleLine(text);
    if (!cleaned) continue;

    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    lines.push(cleaned);
  }

  return lines.join(" ");
}
