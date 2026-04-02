"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function isSafeNextPath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const configMissing = searchParams.get("error") === "config";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(configMissing ? "服务端缺少 APP_PASSWORD 配置。" : "请输入访问密码后继续。");
  const [messageTone, setMessageTone] = useState(configMissing ? "statusError" : "statusInfo");

  async function onSubmit(event) {
    event.preventDefault();

    if (!password) {
      setMessage("请输入密码。");
      setMessageTone("statusError");
      return;
    }

    setBusy(true);
    setMessage("正在验证...");
    setMessageTone("statusInfo");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });

      const data = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(data?.error || "登录失败");
      }

      const next = searchParams.get("next");
      router.replace(isSafeNextPath(next) ? next : "/");
    } catch (error) {
      setMessage(`登录失败：${error instanceof Error ? error.message : "未知错误"}`);
      setMessageTone("statusError");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="authCard">
      <p className="eyebrow">受保护访问</p>
      <h1>Paste Logbook</h1>
      <p className="subtext">这个页面已经启用密码保护。</p>

      <form onSubmit={onSubmit} className="authForm">
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="输入访问密码"
          autoFocus
        />
        <button type="submit" disabled={busy}>
          {busy ? "验证中..." : "进入"}
        </button>
      </form>

      <p className={`status ${messageTone}`}>{message}</p>
    </section>
  );
}

function LoginFallback() {
  return (
    <section className="authCard">
      <p className="eyebrow">受保护访问</p>
      <h1>Paste Logbook</h1>
      <p className="subtext">正在准备登录页面...</p>
    </section>
  );
}

export default function LoginPage() {
  return (
    <main className="authPage">
      <Suspense fallback={<LoginFallback />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
