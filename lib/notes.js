export const MAX_TAGS = 20;

export function normalizeContent(content) {
  return typeof content === "string" ? content.replace(/\r\n/g, "\n").trim() : "";
}

export function normalizeTags(rawTags) {
  if (!Array.isArray(rawTags)) return [];

  const seen = new Set();
  const tags = [];

  for (const item of rawTags) {
    if (typeof item !== "string") continue;

    const value = item.trim().toLowerCase();
    if (!value || seen.has(value)) continue;

    seen.add(value);
    tags.push(value);

    if (tags.length >= MAX_TAGS) break;
  }

  return tags;
}

export function parseTagInput(input) {
  if (typeof input !== "string") return [];

  const normalized = input.replace(/[\uFF0C\uFF1B]/g, ",");
  return normalizeTags(normalized.split(/[,\n;\s]+/g));
}

export function serializeRecord(doc) {
  return {
    id: doc?._id?.toString?.() || doc?.id || "",
    content: typeof doc?.content === "string" ? doc.content : "",
    tags: Array.isArray(doc?.tags) ? doc.tags : [],
    summary: typeof doc?.summary === "string" ? doc.summary : "",
    createdAt: doc?.createdAt || null,
    updatedAt: doc?.updatedAt || null
  };
}

export function toClientRecord(record) {
  const normalized = serializeRecord(record);

  return {
    ...normalized,
    isEditing: false,
    editContent: normalized.content,
    editTags: normalized.tags.join(", ")
  };
}
