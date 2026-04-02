import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCollection } from "@/lib/mongodb";
import { normalizeContent, normalizeTags, serializeRecord } from "@/lib/notes";

export const runtime = "nodejs";

export async function PATCH(request, context) {
  try {
    const params = await context.params;
    const id = params?.id || "";

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid note id." }, { status: 400 });
    }

    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const update = {};

    if ("content" in payload) {
      const content = normalizeContent(payload.content);
      if (!content) {
        return NextResponse.json({ error: "Content cannot be empty." }, { status: 400 });
      }

      update.content = content;
    }

    if ("tags" in payload) {
      update.tags = normalizeTags(payload.tags);
    }

    if ("summary" in payload) {
      update.summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
    }

    update.updatedAt = new Date();

    const collection = await getCollection();
    const updatedDoc = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: "after" }
    );

    if (!updatedDoc) {
      return NextResponse.json({ error: "Record not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      record: serializeRecord(updatedDoc)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to update record.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
