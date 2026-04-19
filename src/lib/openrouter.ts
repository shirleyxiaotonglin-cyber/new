/**
 * OpenRouter Chat Completions — 文本分析生成结构化任务 JSON。
 * 文档：https://openrouter.ai/docs/api/reference
 */

import { PRODUCT_NAME } from "@/lib/product-brand";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type OpenRouterErrorCode =
  | "MISSING_API_KEY"
  | "HTTP_ERROR"
  | "PARSE_ERROR"
  /** DNS / TLS / 超时等非 HTTP 响应类失败 */
  | "FETCH_FAILED";

/** 实际用于 HTTP-Referer 的来源（与浏览器里「其他网站」可能不同，可影响上游策略） */
export type OpenRouterRefererSource =
  | "OPENROUTER_HTTP_REFERER"
  | "NEXT_PUBLIC_APP_URL"
  | "default_localhost"
  | "omitted";

/**
 * 服务端请求 OpenRouter 时附带的应用标识（见 OpenRouter 文档：HTTP-Referer、X-Title）。
 * 与「在别的网站能调通」相比，本应用从 Vercel/本地发请求，Referer/出口 IP 常不同，可显式设置
 * OPENROUTER_HTTP_REFERER 为线上 https 根地址，与开放者中心里的应用 URL 一致。
 */
export function getOpenRouterAttribution(): {
  referer: string;
  title: string;
  omitAttribution: boolean;
  refererSource: OpenRouterRefererSource;
} {
  const title = process.env.OPENROUTER_APP_TITLE?.trim() || PRODUCT_NAME;
  const omit =
    process.env.OPENROUTER_OMIT_ATTRIBUTION?.trim() === "1" ||
    process.env.OPENROUTER_OMIT_ATTRIBUTION?.toLowerCase().trim() === "true";

  if (omit) {
    return {
      referer: "",
      title,
      omitAttribution: true,
      refererSource: "omitted",
    };
  }

  const explicit = process.env.OPENROUTER_HTTP_REFERER?.trim();
  if (explicit) {
    return {
      referer: explicit,
      title,
      omitAttribution: false,
      refererSource: "OPENROUTER_HTTP_REFERER",
    };
  }

  const nextPublic = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (nextPublic) {
    return {
      referer: nextPublic,
      title,
      omitAttribution: false,
      refererSource: "NEXT_PUBLIC_APP_URL",
    };
  }

  return {
    referer: "http://localhost:3000",
    title,
    omitAttribution: false,
    refererSource: "default_localhost",
  };
}

/** OpenRouter POST 的请求头（含 Authorization）；omit 时不附带 Referer / X-Title。 */
export function openRouterRequestHeaders(apiKey: string): Record<string, string> {
  const { referer, title, omitAttribution } = getOpenRouterAttribution();
  const h: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (!omitAttribution) {
    h["HTTP-Referer"] = referer;
    h["X-Title"] = title;
  }
  return h;
}

/** 附加在 HTTP 类错误上，便于 API 返回友好文案 */
export type OpenRouterHttpError = Error & {
  code: OpenRouterErrorCode;
  httpStatus: number;
  /** OpenRouter error.message */
  upstreamMessage?: string;
  /** 审核类 403 时可能有 */
  moderationReasons?: string[];
  flaggedInputSnippet?: string;
  /** 最终使用的模型（含 fallback） */
  modelUsed?: string;
};

function parseOpenRouterBody(text: string): {
  upstreamMessage?: string;
  nestedCode?: number;
  metadata?: Record<string, unknown>;
} {
  try {
    const j = JSON.parse(text) as {
      error?: { message?: string; code?: number; metadata?: Record<string, unknown> };
    };
    const err = j?.error;
    return {
      upstreamMessage: typeof err?.message === "string" ? err.message : undefined,
      nestedCode: typeof err?.code === "number" ? err.code : undefined,
      metadata: err?.metadata && typeof err.metadata === "object" ? err.metadata : undefined,
    };
  } catch {
    return {};
  }
}

function moderationFromMeta(meta: Record<string, unknown> | undefined): {
  reasons?: string[];
  flagged?: string;
} {
  if (!meta) return {};
  const reasons = meta.reasons;
  const flagged = meta.flagged_input;
  return {
    reasons: Array.isArray(reasons)
      ? reasons.filter((x): x is string => typeof x === "string")
      : undefined,
    flagged: typeof flagged === "string" ? flagged : undefined,
  };
}

/** 解析 OpenRouter HTTP 200 的正文 JSON；若非 JSON、或顶层含 error，则抛出 HTTP_ERROR */
function assertOpenRouterSuccessEnvelope(
  text: string,
  modelUsed: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw buildHttpError(502, text.trim().slice(0, 500) || "Invalid JSON response body", modelUsed);
  }
  if (!parsed || typeof parsed !== "object") {
    throw buildHttpError(502, "Empty JSON object from OpenRouter", modelUsed);
  }
  const root = parsed as Record<string, unknown>;
  const eo = root.error;
  if (eo !== undefined && eo !== null) {
    let msg = "";
    if (typeof eo === "object" && eo !== null && typeof (eo as { message?: unknown }).message === "string") {
      msg = (eo as { message: string }).message;
    } else if (typeof eo === "string") {
      msg = eo;
    } else {
      msg = JSON.stringify(eo).slice(0, 600);
    }
    throw buildHttpError(502, msg, modelUsed);
  }
  return root;
}

function buildHttpError(
  status: number,
  bodyText: string,
  modelUsed: string,
): OpenRouterHttpError {
  const parsed = parseOpenRouterBody(bodyText);
  const mod = moderationFromMeta(parsed.metadata);
  const upstream =
    parsed.upstreamMessage ?? (bodyText.slice(0, 300).trim() || `HTTP ${status}`);

  const short =
    status === 403
      ? `OpenRouter 403：${upstream}`
      : `OpenRouter ${status}: ${upstream}`;

  const err = new Error(short) as OpenRouterHttpError;
  err.code = "HTTP_ERROR";
  err.httpStatus = status;
  err.upstreamMessage = upstream;
  err.modelUsed = modelUsed;
  if (mod.reasons?.length) err.moderationReasons = mod.reasons;
  if (mod.flagged) err.flaggedInputSnippet = mod.flagged;
  return err;
}

export async function openRouterComplete(
  messages: ChatMessage[],
  options?: {
    /** 默认读 OPENROUTER_MODEL，否则 openai/gpt-4o-mini */
    model?: string;
    temperature?: number;
    /** 默认 4096；智能解析等长 JSON 可提高以减少截断 */
    maxTokens?: number;
    /** 部分模型支持；若上游返回 400 会自动重试一次不带该字段 */
    responseFormat?: { type: "json_object" };
    /**
     * JSON 结构化路由应设为 true：不要把安全拒答文案当作模型输出去解析，
     * 否则会误解析失败；报告/计划等 prose 路由保持默认（false）。
     */
    skipRefusal?: boolean;
  },
): Promise<{ content: string; rawModel: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error("OPENROUTER_API_KEY is not set") as Error & { code: OpenRouterErrorCode };
    err.code = "MISSING_API_KEY";
    throw err;
  }

  /* 供内联 async 闭包使用，便于 TS 将密钥收窄为 string */
  const bearerKey = apiKey;

  const primaryModel =
    options?.model?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    "openai/gpt-4o-mini";

  const fallbackModel = process.env.OPENROUTER_FALLBACK_MODEL?.trim();

  async function sendCompletion(model: string, skipResponseFormat: boolean): Promise<Response> {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: options?.temperature ?? 0.35,
      max_tokens: options?.maxTokens ?? 4096,
    };
    if (options?.responseFormat && !skipResponseFormat) {
      body.response_format = options.responseFormat;
    }

    try {
      return await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: openRouterRequestHeaders(bearerKey),
        body: JSON.stringify(body),
      });
    } catch (cause: unknown) {
      const inner = cause instanceof Error ? cause.message : String(cause);
      const err = new Error(`OpenRouter fetch failed: ${inner}`) as Error & {
        code: OpenRouterErrorCode;
      };
      err.code = "FETCH_FAILED";
      throw err;
    }
  }

  let res = await sendCompletion(primaryModel, false);
  let modelUsed = primaryModel;

  if (
    !res.ok &&
    res.status === 403 &&
    fallbackModel &&
    fallbackModel !== primaryModel
  ) {
    res = await sendCompletion(fallbackModel, false);
    modelUsed = fallbackModel;
  }

  if (!res.ok && res.status === 400 && options?.responseFormat) {
    res = await sendCompletion(modelUsed, true);
  }

  const responseText = await res.text();

  if (!res.ok) {
    throw buildHttpError(res.status, responseText, modelUsed);
  }

  const data = assertOpenRouterSuccessEnvelope(responseText, modelUsed);
  const content = extractAssistantMessageText(data, {
    skipRefusal: options?.skipRefusal === true,
  });
  if (!content) {
    const err = new Error("Empty OpenRouter response") as Error & { code: OpenRouterErrorCode };
    err.code = "PARSE_ERROR";
    throw err;
  }
  const rawModel = typeof data.model === "string" ? data.model : modelUsed;
  return { content, rawModel };
}

/** 从 Chat Completions 响应中取助手文本（兼容纯文本、多段 content、部分模型的 reasoning） */
export function extractAssistantMessageText(
  data: unknown,
  opts?: { skipRefusal?: boolean },
): string {
  if (!data || typeof data !== "object") return "";
  const root = data as Record<string, unknown>;
  const choices = root.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const ch = choices[0] as Record<string, unknown>;

  if (typeof ch.text === "string" && ch.text.trim()) return ch.text.trim();

  const msg = ch.message as Record<string, unknown> | undefined;
  if (!msg || typeof msg !== "object") return "";

  if (!opts?.skipRefusal) {
    const refusal = msg.refusal;
    if (typeof refusal === "string" && refusal.trim()) return refusal.trim();
  }

  const c = msg.content;
  if (typeof c === "string" && c.trim()) return c.trim();
  if (Array.isArray(c)) {
    const joined = c
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const p = part as Record<string, unknown>;
        if (p.type === "text" && typeof p.text === "string") return p.text;
        if (typeof p.text === "string") return p.text;
        return "";
      })
      .join("");
    if (joined.trim()) return joined.trim();
  }

  const reasoningContent = msg.reasoning_content;
  if (typeof reasoningContent === "string" && reasoningContent.trim()) return reasoningContent.trim();

  const reasoning = msg.reasoning;
  if (typeof reasoning === "string" && reasoning.trim()) return reasoning.trim();

  return "";
}

/** 从模型输出中提取 JSON 字符串（处理 ```json 围栏；支持根为数组 `[...]`） */
export function extractJsonObject(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const inner = fence?.[1]?.trim() ?? text.trim();
  try {
    JSON.parse(inner);
    return inner;
  } catch {
    /* 继续从文中截取对象或数组 */
  }
  if (inner.startsWith("[")) {
    const a0 = inner.indexOf("[");
    const a1 = inner.lastIndexOf("]");
    if (a0 >= 0 && a1 > a0) return inner.slice(a0, a1 + 1);
  }
  const start = inner.indexOf("{");
  const end = inner.lastIndexOf("}");
  if (start >= 0 && end > start) return inner.slice(start, end + 1);
  return inner;
}

export function isOpenRouterHttpError(e: unknown): e is OpenRouterHttpError {
  return (
    e instanceof Error &&
    "httpStatus" in e &&
    typeof (e as OpenRouterHttpError).httpStatus === "number" &&
    "code" in e &&
    (e as { code?: string }).code === "HTTP_ERROR"
  );
}
