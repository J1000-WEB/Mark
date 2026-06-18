"use client";

import { FormEvent, useEffect, useState } from "react";

const PASSWORD = "0128";
const AUTH_KEY = "mark_auth";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setAuthed(localStorage.getItem(AUTH_KEY) === "true");
    setReady(true);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (password === PASSWORD) {
      localStorage.setItem(AUTH_KEY, "true");
      setAuthed(true);
      setError("");
      if (window.location.pathname === "/") {
        window.location.href = "/weekly";
      }
      return;
    }
    setError("비밀번호가 올바르지 않습니다.");
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm font-semibold text-slate-500">대시보드를 불러오는 중입니다.</p>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">
          <p className="text-sm font-black text-blue-600">GENERAL IDEA</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight">소재천 운영 대시보드</h1>
          <p className="mt-2 text-sm text-slate-500">비밀번호를 입력하면 주간 대시보드로 이동합니다.</p>

          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            className="mt-6 w-full rounded-2xl border border-slate-200 px-4 py-3 text-lg font-bold outline-none focus:border-slate-900"
          />
          {error && <p className="mt-3 text-sm font-bold text-red-600">{error}</p>}

          <button type="submit" className="mt-5 w-full rounded-2xl bg-slate-900 px-4 py-3 font-black text-white">
            입장하기
          </button>
        </form>
      </main>
    );
  }

  return <>{children}</>;
}
