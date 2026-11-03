import { env } from "node:process";

export type SummaryLang = "ar" | "en" | "zh" | "auto";

const BASE_URL = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

/**
 * System prompt per summary language. "auto" asks the model to reply in the
 * same language as the transcript/video instead of forcing a single language.
 */
function systemPromptFor(lang: SummaryLang): string {
  if (lang === "ar") {
    return `أنت مساعد يعيد صياغة نص تحويل فيديو يوتيوب إلى "نسخة قراءة" منظمة حسب المواضيع، بحيث يمكن للقارئ فهم محتوى الفيديو بالكامل من خلال القراءة، كما لو كان يقرأ نسخة مدونة من الفيديو.

متطلبات الإخراج:

1. بيانات التعريف
- العنوان
- المؤلف
- الرابط

2. نظرة عامة
فقرة واحدة توضح المحور الأساسي للفيديو وخلاصته.

3. الترتيب حسب المواضيع
- كل قسم يُفصل بناءً على محتوى الفيديو بحيث لا يحتاج القارئ لمشاهدة الفيديو مرة أخرى؛ كل قسم لا يقل عن 500 كلمة.
- إذا ظهرت طريقة/إطار/عملية، أعد صياغتها كخطوات واضحة أو فقرات.
- إذا ظهرت أرقام رئيسية أو تعريفات أو اقتباسات، احتفظ بالكلمات الأساسية وأضف توضيحاً بين قوسين.

الأسلوب والقيود:
- لا تُختزل بشدة أبدًا.
- لا تضيف حقائق جديدة؛ إذا كان التعبير غامضاً، احتفظ بالمعنى الأصلي وحدد عدم اليقين.
- الأسماء الخاصة تُحتفظ بها بالنص الأصلي، مع إضافة ترجمة بالعربية بين قوسين عند توفرها.
- لا تعكس أسئلة المتطلبات (مثل > 500 كلمة).
- تجنب الفقرات الطويلة جداً؛ قسّم إلى فقرات منطقية (نقاط وبوائت).`;
  }

  if (lang === "zh") {
    return `你将把一段 YouTube 视频重写成"阅读版本"，按内容主题分成若干小节；目标是让读者通过阅读就能完整理解视频讲了什么，就好像是在读一篇 Blog 版的文章一样。

输出要求：

1. Metadata
- Title
- Author
- URL

2. Overview
用一段话点明视频的核心论题与结论。

3. 按照主题来梳理
- 每个小节都需要根据视频中的内容详细展开，让我不需要再二次查看视频了解详情，每个小节不少于 500 字。
- 若出现方法/框架/流程，将其重写为条理清晰的步骤或段落。
- 若有关键数字、定义、原话，请如实保留核心词，并在括号内补充注释。

风格与限制：
- 永远不要高度浓缩！
- 不新增事实；若出现含混表述，请保持原意并注明不确定性。
- 专有名词保留原文，并在括号给出中文释义（若转录中出现或能直译）。
- 要求类的问题不用体现出来（例如 > 500 字）。
- 避免一个段落的内容过多，可以拆解成多个逻辑段落（使用 bullet points）。`;
  }

  if (lang === "auto") {
    return `You will rewrite a YouTube video transcript into a "reading version", organized by topic into sections, replying in the SAME LANGUAGE as the transcript/video, so the reader can fully understand what the video said just by reading, like a blog version of the article.

Output requirements:

1. Metadata
- Title
- Author
- URL

2. Overview
One paragraph stating the core thesis and conclusion.

3. Organize by theme
- Each section should expand on the video content in detail so the reader does not need to re-watch; each section at least 500 words.
- If a method/framework/process appears, rewrite it as clear steps or paragraphs.
- If key numbers, definitions, or quotes appear, keep the core terms and add a note in parentheses.

Style and limits:
- Never over-summarize!
- Do not add new facts; if expression is ambiguous, keep the original meaning and note uncertainty.
- Keep proper nouns as-is, with an explanation in parentheses when available.
- Requirement-style questions should not be reflected (e.g. > 500 words).
- Avoid overly long paragraphs; split into logical paragraphs (use bullet points).`;
  }

  // "en"
  return `You will rewrite a YouTube video transcript into a "reading version", organized by topic into sections, so the reader can fully understand what the video said just by reading, like a blog version of the article.

Output requirements:

1. Metadata
- Title
- Author
- URL

2. Overview
One paragraph stating the core thesis and conclusion.

3. Organize by theme
- Each section should expand on the video content in detail so the reader does not need to re-watch; each section at least 500 words.
- If a method/framework/process appears, rewrite it as clear steps or paragraphs.
- If key numbers, definitions, or quotes appear, keep the core terms and add a note in parentheses.

Style and limits:
- Never over-summarize!
- Do not add new facts; if expression is ambiguous, keep the original meaning and note uncertainty.
- Keep proper nouns as-is, with an explanation in parentheses when available.
- Requirement-style questions should not be reflected (e.g. > 500 words).
- Avoid overly long paragraphs; split into logical paragraphs (use bullet points).`;
}

export interface SummarizeOptions {
  title?: string;
  author?: string;
  url?: string;
  model?: string;
  lang?: SummaryLang;
}

export async function summarizeTranscript(
  transcript: string,
  options: SummarizeOptions = {}
): Promise<string> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required for --summarize.\n" +
        "Set it in your environment or .env file."
    );
  }

  const model = options.model || "gpt-4o";
  const lang: SummaryLang = options.lang ?? "auto";
  const systemPrompt = systemPromptFor(lang);
  const metadata = buildMetadata(options);

  const userPrompt = `${metadata}\n\n以下是视频的转录文本：\n\n${transcript}`;

  process.stderr.write(`[summarize] Using ${model} (lang=${lang}) to summarize transcript...\n`);

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${error}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI API returned empty response");
  }

  return content;
}

function buildMetadata(options: SummarizeOptions): string {
  const lines: string[] = ["视频信息："];

  if (options.title) {
    lines.push(`- Title: ${options.title}`);
  }
  if (options.author) {
    lines.push(`- Author: ${options.author}`);
  }
  if (options.url) {
    lines.push(`- URL: ${options.url}`);
  }

  return lines.length > 1 ? lines.join("\n") : "";
}
