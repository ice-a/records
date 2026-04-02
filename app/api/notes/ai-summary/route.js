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

    return NextResponse.json({ ok: true, summary });
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
