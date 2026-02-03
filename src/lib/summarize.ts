import { env } from "node:process";

const SYSTEM_PROMPT = `你将把一段 YouTube 视频重写成"阅读版本"，按内容主题分成若干小节；目标是让读者通过阅读就能完整理解视频讲了什么，就好像是在读一篇 Blog 版的文章一样。

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

export interface SummarizeOptions {
  title?: string;
  author?: string;
  url?: string;
  model?: string;
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
  const metadata = buildMetadata(options);

  const userPrompt = `${metadata}

以下是视频的转录文本：

${transcript}`;

  process.stderr.write(`[summarize] Using ${model} to summarize transcript...\n`);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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
