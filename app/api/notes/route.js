import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { normalizeContent, normalizeTags, serializeRecord } from "@/lib/notes";

export const runtime = "nodejs";

const RECORD_PROJECTION = {
  _id: 1,
  content: 1,
  tags: 1,
  summary: 1,
  createdAt: 1,
  updatedAt: 1
};

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const tag = searchParams.get("tag")?.trim().toLowerCase() || "";

    const collection = await getCollection();
    const filter = {};

    if (search) {
      const regex = new RegExp(escapeRegExp(search), "i");
      filter.$or = [{ content: regex }, { summary: regex }, { tags: regex }];
    }

    if (tag) {
      filter.tags = tag;
    }

    const records = await collection
      .find(filter)
      .project(RECORD_PROJECTION)
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();

    return NextResponse.json({
      records: records.map(serializeRecord)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load records.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const content = normalizeContent(payload?.content);
    const tags = normalizeTags(payload?.tags);

    if (!content) {
      return NextResponse.json({ error: "Content is required." }, { status: 400 });
    }

    const collection = await getCollection();
    const now = new Date();

    const result = await collection.insertOne({
      content,
      tags,
      summary: "",
      createdAt: now,
      updatedAt: now
    });

    const inserted = await collection.findOne({ _id: result.insertedId }, { projection: RECORD_PROJECTION });
    if (!inserted) {
      return NextResponse.json({ error: "Record insert verification failed." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      record: serializeRecord(inserted)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to save records.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
