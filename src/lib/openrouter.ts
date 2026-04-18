/**
 * OpenRouter Chat Completions — 文本分析生成结构化任务 JSON。
 * 文档：https://openrouter.ai/docs/api/reference
 */

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type OpenRouterErrorCode = "MISSING_API_KEY" | "HTTP_ERROR" | "PARSE_ERROR";

export async function openRouterComplete(
  messages: ChatMessage[],
  options?: {
    /** 默认读 OPENROUTER_MODEL，否则 openai/gpt-4o-mini */
    model?: string;
    temperature?: number;
  },
): Promise<{ content: string; rawModel: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey?.trim()) {
    const err = new Error("OPENROUTER_API_KEY is not set") as Error & { code: OpenRouterErrorCode };
    err.code = "MISSING_API_KEY";
    throw err;
  }

  const model =
    options?.model?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    "openai/gpt-4o-mini";

  const referer = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.35,
    max_tokens: 4096,
  };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": "ProjectHub",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    const err = new Error(`OpenRouter ${res.status}: ${t.slice(0, 500)}`) as Error & {
      code: OpenRouterErrorCode;
    };
    err.code = "HTTP_ERROR";
    throw err;
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    model?: string;
  };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) {
    const err = new Error("Empty OpenRouter response") as Error & { code: OpenRouterErrorCode };
    err.code = "PARSE_ERROR";
    throw err;
  }
  return { content, rawModel: data.model ?? model };
}

/** 从模型输出中提取 JSON（处理 ```json 围栏） */
export function extractJsonObject(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}
