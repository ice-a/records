import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_MODEL = "LongCat-Flash-Chat";
const DEFAULT_URL = "https://api.longcat.chat/openai/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 15000;

function normalizeInput(content) {
  if (typeof content !== "string") return "";

  const trimmed = content.replace(/\r\n/g, "\n").trim();
  if (trimmed.length <= 12000) return trimmed;

  return trimmed.slice(0, 12000);
}

function truncate(text, maxLength = 120) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function splitMeaningfulLines(content) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitSentences(content) {
  return content
    .replace(/\n+/g, "\n")
    .split(/(?<=[。！？.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildFallbackSummary(content, reason) {
  const lines = splitMeaningfulLines(content);
  const sentences = splitSentences(content);
  const heading = lines.find((line) => /^#{1,6}\s+/.test(line));
  const bulletLines = lines
    .filter((line) => /^([-*+]|\d+\.)\s+/.test(line))
    .map((line) => truncate(line.replace(/^([-*+]|\d+\.)\s+/, "")))
    .filter(Boolean);

  const conclusionSource =
    heading?.replace(/^#{1,6}\s+/, "") ||
    sentences.find((sentence) => sentence.length >= 12) ||
    lines[0] ||
    "这段内容包含需要后续整理的信息。";

  const sentencePoints = sentences
    .filter((sentence) => sentence !== conclusionSource)
    .map((sentence) => truncate(sentence))
    .filter((sentence) => sentence.length >= 10);

  const pointSet = new Set();
  const points = [];

  for (const candidate of [...bulletLines, ...sentencePoints]) {
    if (!candidate || pointSet.has(candidate)) continue;
    pointSet.add(candidate);
    points.push(candidate);
    if (points.length >= 4) break;
  }

  if (points.length === 0) {
    points.push(truncate(conclusionSource));
  }

  const reasonText = truncate(reason, 80);

  return [
    `> AI 服务暂时不可用，已返回本地回退摘要。原因：${reasonText}`,
    "",
    `**结论**：${truncate(conclusionSource, 140)}`,
    "",
    ...points.map((point) => `- ${point}`)
  ].join("\n");
}

function describeFetchError(error) {
  if (!(error instanceof Error)) {
    return "Unknown network error";
  }

  const causeCode =
    typeof error.cause === "object" && error.cause && "code" in error.cause
      ? error.cause.code
      : "";

  if (error.name === "TimeoutError") {
    return `Request timed out after ${REQUEST_TIMEOUT_MS}ms`;
  }

  if (causeCode) {
    return `${error.message} (${causeCode})`;
  }

  return error.message;
}

export async function POST(request) {
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const content = normalizeInput(payload?.content);
    if (!content) {
      return NextResponse.json({ error: "Content is required for AI summary." }, { status: 400 });
    }

    const apiKey = process.env.LONGCAT_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing LONGCAT_API_KEY." }, { status: 500 });
    }

    const model = process.env.LONGCAT_MODEL || DEFAULT_MODEL;
    const endpoint = process.env.LONGCAT_API_URL || DEFAULT_URL;
    const signal =
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        : undefined;

    try {
      const aiResponse = await fetch(endpoint, {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are a concise summarization assistant. Return plain markdown with a short conclusion first, then bullet points."
            },
            {
              role: "user",
              content: `Summarize the following content:\n\n${content}`
            }
          ],
          max_tokens: 1000,
          temperature: 0.4
        })
      });

      const data = await aiResponse.json().catch(() => null);
      if (!aiResponse.ok) {
        const detail = data?.error?.message || data?.error || `HTTP ${aiResponse.status}`;
        return NextResponse.json({ error: "AI summary request failed.", detail }, { status: 502 });
      }

      const summary = data?.choices?.[0]?.message?.content?.trim();
      if (!summary) {
        return NextResponse.json(
          { error: "AI returned empty summary.", detail: "No content in choices[0].message.content" },
          { status: 502 }
        );
      }

      return NextResponse.json({ ok: true, summary, mode: "remote" });
    } catch (error) {
      const detail = describeFetchError(error);
      const summary = buildFallbackSummary(content, detail);

      return NextResponse.json({
        ok: true,
        summary,
        mode: "fallback",
        detail
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to generate AI summary.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
