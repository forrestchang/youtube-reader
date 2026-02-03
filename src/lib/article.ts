export type ArticleOptions = {
  title?: string;
  sourceUrl?: string;
  paragraphWords?: number;
};

export function buildArticle(text: string, options: ArticleOptions = {}): string {
  const cleaned = normalizeText(text);
  const title = options.title?.trim() || "Transcript";
  const paragraphs = toParagraphs(cleaned, options.paragraphWords ?? 90);

  const lines: string[] = [`# ${title}`];
  if (options.sourceUrl) {
    lines.push("", `Source: ${options.sourceUrl}`);
  }
  lines.push("", ...paragraphs);

  return lines.join("\n").trim() + "\n";
}

function normalizeText(input: string): string {
  return input
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

function toParagraphs(text: string, targetWords: number): string[] {
  if (!text) return [];

  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return wrapByWords(text.split(/\s+/), targetWords);
  }

  const paragraphs: string[] = [];
  let current: string[] = [];
  let wordCount = 0;

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    if (wordCount >= targetWords && current.length > 0) {
      paragraphs.push(current.join(" "));
      current = [];
      wordCount = 0;
    }

    current.push(sentence);
    wordCount += words.length;
  }

  if (current.length > 0) {
    paragraphs.push(current.join(" "));
  }

  return paragraphs;
}

function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+/).map((s) => s.trim());
  const joined = parts.filter(Boolean);
  return joined;
}

function wrapByWords(words: string[], targetWords: number): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const word of words) {
    current.push(word);
    if (current.length >= targetWords) {
      paragraphs.push(current.join(" "));
      current = [];
    }
  }

  if (current.length > 0) {
    paragraphs.push(current.join(" "));
  }

  return paragraphs;
}
