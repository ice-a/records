"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeContent, parseTagInput, toClientRecord } from "@/lib/notes";

const INITIAL_STATUS = {
  text: "正在加载云端记录...",
  tone: "statusInfo"
};

function formatTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("zh-CN", { hour12: false });
}

function getErrorMessage(error, fallback = "未知错误") {
  return error instanceof Error ? error.message : fallback;
}

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const data = await readJsonSafely(response);

  if (!response.ok) {
    const error = new Error(data?.detail || data?.error || `请求失败（${response.status}）`);
    error.status = response.status;
    throw error;
  }

  return data;
}

export default function HomePage() {
  const [draftContent, setDraftContent] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [savedRecords, setSavedRecords] = useState([]);
  const [searchText, setSearchText] = useState("");
  const deferredSearchText = useDeferredValue(searchText);
  const [activeTag, setActiveTag] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [status, setStatus] = useState(INITIAL_STATUS);

  const busy = busyAction !== "";

  const allTags = useMemo(() => {
    const tagSet = new Set();

    for (const record of savedRecords) {
      for (const tag of record.tags) {
        tagSet.add(tag);
      }
    }

    return Array.from(tagSet).sort((left, right) => left.localeCompare(right));
  }, [savedRecords]);

  const filteredRecords = useMemo(() => {
    const keyword = deferredSearchText.trim().toLowerCase();

    return savedRecords.filter((record) => {
      if (activeTag && !record.tags.includes(activeTag)) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const haystack = [record.content, record.summary, record.tags.join(" ")].join("\n").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [activeTag, deferredSearchText, savedRecords]);

  useEffect(() => {
    void loadRecords();
  }, []);

  function showStatus(text, tone = "statusInfo") {
    setStatus({ text, tone });
  }

  function updateRecord(id, updater) {
    setSavedRecords((previous) =>
      previous.map((record) => (record.id === id ? updater(record) : record))
    );
  }

  async function loadRecords() {
    setBusyAction("load");
    showStatus("正在加载云端记录...", "statusInfo");

    try {
      const data = await requestJson("/api/notes");
      const records = (Array.isArray(data?.records) ? data.records : []).map(toClientRecord);

      setSavedRecords(records);
      showStatus(`读取成功，共 ${records.length} 条记录。`, "statusSuccess");
    } catch (error) {
      if (error?.status === 401) {
        window.location.href = "/login";
        return;
      }

      showStatus(`读取失败：${getErrorMessage(error)}`, "statusError");
    } finally {
      setBusyAction("");
    }
  }

  async function logout() {
    setBusyAction("logout");

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  async function saveDraft() {
    const content = normalizeContent(draftContent);
    if (!content) {
      showStatus("当前记录为空，请先输入内容。", "statusError");
      return;
    }

    setBusyAction("save-draft");
    showStatus("正在保存记录...", "statusInfo");

    try {
      const data = await requestJson("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          tags: parseTagInput(draftTags)
        })
      });

      setSavedRecords((previous) => [toClientRecord(data.record), ...previous]);
      setDraftContent("");
      setDraftTags("");
      showStatus("保存成功，已经写入新的记录。", "statusSuccess");
    } catch (error) {
      showStatus(`保存失败：${getErrorMessage(error)}`, "statusError");
    } finally {
      setBusyAction("");
    }
  }

  function beginEdit(id) {
    updateRecord(id, (record) => ({
      ...record,
      isEditing: true,
      editContent: record.content,
      editTags: record.tags.join(", ")
    }));
  }

  function cancelEdit(id) {
    updateRecord(id, (record) => ({
      ...record,
      isEditing: false,
      editContent: record.content,
      editTags: record.tags.join(", ")
    }));
  }

  function changeEditContent(id, value) {
    updateRecord(id, (record) => ({ ...record, editContent: value }));
  }

  function changeEditTags(id, value) {
    updateRecord(id, (record) => ({ ...record, editTags: value }));
  }

  async function saveEdit(id) {
    const target = savedRecords.find((record) => record.id === id);
    if (!target) return;

    const content = normalizeContent(target.editContent);
    if (!content) {
      showStatus("编辑内容不能为空。", "statusError");
      return;
    }

    setBusyAction(`save-edit:${id}`);
    showStatus("正在保存修改...", "statusInfo");

    try {
      const data = await requestJson(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          tags: parseTagInput(target.editTags)
        })
      });

      updateRecord(id, () => toClientRecord(data.record));
      showStatus("修改已保存。", "statusSuccess");
    } catch (error) {
      showStatus(`修改失败：${getErrorMessage(error)}`, "statusError");
    } finally {
      setBusyAction("");
    }
  }

  async function askAiSummary(content, fallbackErrorText) {
    const source = normalizeContent(content);
    if (!source) {
      showStatus("没有可总结的内容。", "statusError");
      return null;
    }

    const data = await requestJson("/api/notes/ai-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: source })
    });

    const summary = typeof data?.summary === "string" ? data.summary.trim() : "";
    if (!summary) {
      throw new Error(fallbackErrorText);
    }

    return summary;
  }

  async function summarizeDraft() {
    const fallbackSource = filteredRecords.map((record) => record.content).join("\n\n---\n\n");
    const source = normalizeContent(draftContent) || normalizeContent(fallbackSource);

    if (!source) {
      showStatus("新记录区和筛选结果都为空，暂时无法总结。", "statusError");
      return;
    }

    setBusyAction("summarize-draft");
    showStatus("AI 正在生成总结...", "statusInfo");

    try {
      const summary = await askAiSummary(source, "AI 返回了空摘要。");
      if (!summary) {
        return;
      }

      setDraftContent((previous) => {
        const base = normalizeContent(previous);
        return base ? `${previous}\n\n## AI 总结\n${summary}` : summary;
      });
      showStatus("AI 总结已经写入新记录区。", "statusSuccess");
    } catch (error) {
      showStatus(`AI 总结失败：${getErrorMessage(error)}`, "statusError");
    } finally {
      setBusyAction("");
    }
  }

  async function summarizeRecord(id) {
    const target = savedRecords.find((record) => record.id === id);
    if (!target) return;

    setBusyAction(`summarize:${id}`);
    showStatus("正在为这条记录生成 AI 摘要...", "statusInfo");

    try {
      const summary = await askAiSummary(target.content, "AI 返回了空摘要。");
      if (!summary) {
        return;
      }

      const data = await requestJson(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary })
      });

      updateRecord(id, () => toClientRecord(data.record));
      showStatus("AI 摘要已经保存到记录中。", "statusSuccess");
    } catch (error) {
      showStatus(`AI 总结失败：${getErrorMessage(error)}`, "statusError");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Paste-First Notes</p>
        <h1>记录、搜索、标签分类和一键 AI 总结</h1>
        <p className="subtext">
          每条记录都会独立保存到 MongoDB，并保留创建和更新时间。已保存记录默认只读，点编辑后再进入修改状态。
        </p>

        <div className="toolbar">
          <button onClick={saveDraft} disabled={busy}>
            {busyAction === "save-draft" ? "保存中..." : "保存当前记录"}
          </button>
          <button onClick={summarizeDraft} disabled={busy} className="secondary">
            {busyAction === "summarize-draft" ? "总结中..." : "一键 AI"}
          </button>
          <button onClick={loadRecords} disabled={busy} className="secondary">
            {busyAction === "load" ? "刷新中..." : "刷新云端"}
          </button>
          <button onClick={logout} disabled={busy} className="danger">
            {busyAction === "logout" ? "退出中..." : "锁定"}
          </button>
          <span className="meta">{`总数：${savedRecords.length}，筛选后：${filteredRecords.length}`}</span>
        </div>

        <div className="filters">
          <input
            type="text"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="搜索内容、摘要或标签..."
          />
          <select value={activeTag} onChange={(event) => setActiveTag(event.target.value)}>
            <option value="">全部标签</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>

        <p className={`status ${status.tone}`}>{status.text}</p>
      </section>

      <section className="cards">
        <article className="card">
          <header className="cardHeader">
            <h2>新记录区</h2>
          </header>
          <textarea
            value={draftContent}
            onChange={(event) => setDraftContent(event.target.value)}
            placeholder="在这里输入或粘贴内容，支持 Markdown..."
          />
          <input
            className="tagInput"
            type="text"
            value={draftTags}
            onChange={(event) => setDraftTags(event.target.value)}
            placeholder="标签（逗号分隔）：工作, 灵感, 待办"
          />
          <div className="preview">
            <p className="previewTitle">Markdown 预览</p>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {draftContent.trim() ? draftContent : "_空内容_"}
            </ReactMarkdown>
          </div>
        </article>

        {filteredRecords.map((record) => (
          <article key={record.id} className="card">
            <header className="cardHeader">
              <div>
                <h2>已保存记录</h2>
                <p className="timeText">
                  创建：{formatTime(record.createdAt)} | 更新：{formatTime(record.updatedAt)}
                </p>
              </div>

              {!record.isEditing ? (
                <div className="inlineActions">
                  <button
                    className="secondary"
                    onClick={() => summarizeRecord(record.id)}
                    disabled={busy}
                  >
                    {busyAction === `summarize:${record.id}` ? "生成中..." : "AI 摘要"}
                  </button>
                  <button className="secondary" onClick={() => beginEdit(record.id)} disabled={busy}>
                    编辑
                  </button>
                </div>
              ) : (
                <div className="inlineActions">
                  <button onClick={() => saveEdit(record.id)} disabled={busy}>
                    {busyAction === `save-edit:${record.id}` ? "保存中..." : "保存修改"}
                  </button>
                  <button className="danger" onClick={() => cancelEdit(record.id)} disabled={busy}>
                    取消
                  </button>
                </div>
              )}
            </header>

            {record.tags.length > 0 && (
              <div className="tagGroup">
                {record.tags.map((tag) => (
                  <button
                    type="button"
                    key={`${record.id}-${tag}`}
                    className={`tagChip ${activeTag === tag ? "tagChipActive" : ""}`}
                    onClick={() => setActiveTag((previous) => (previous === tag ? "" : tag))}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            {record.isEditing && (
              <div className="editPanel">
                <textarea
                  value={record.editContent}
                  onChange={(event) => changeEditContent(record.id, event.target.value)}
                  placeholder="编辑记录内容..."
                />
                <input
                  className="tagInput"
                  type="text"
                  value={record.editTags}
                  onChange={(event) => changeEditTags(record.id, event.target.value)}
                  placeholder="编辑标签（逗号分隔）"
                />
              </div>
            )}

            <div className="preview">
              <p className="previewTitle">内容预览</p>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {record.isEditing ? record.editContent.trim() || "_空内容_" : record.content.trim() || "_空内容_"}
              </ReactMarkdown>
            </div>

            {record.summary && (
              <div className="summaryBox">
                <p className="previewTitle">AI 摘要</p>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{record.summary}</ReactMarkdown>
              </div>
            )}
          </article>
        ))}

        {filteredRecords.length === 0 && (
          <article className="card emptyState">
            <p>当前筛选条件下没有匹配记录。</p>
          </article>
        )}
      </section>
    </main>
  );
}
