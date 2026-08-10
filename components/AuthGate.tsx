"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const PASSWORD = "0128";
const AUTH_KEY = "mark_auth";

// MARK 6.83: 매장별 개별 배포 링크(/store/[코드])는 회사 로그인 비밀번호를 몰라도 열리게
// 합니다 — 그 대신 mark_auth를 저장하지 않아서, 같은 태블릿에서 /weekly 등 다른 경로로
// 이동하려 하면 여기 로그인 화면에 그대로 걸립니다(비밀번호를 모르니 못 들어감).
// "/store" 그 자체(관리자용, 매장 선택 드롭다운 있는 페이지)는 그대로 로그인 필요.
function isStoreDirectLink(pathname: string | null) {
  if (!pathname) return false;
  const parts = pathname.split("/").filter(Boolean);
  return parts[0] === "store" && parts.length >= 2;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bypass = isStoreDirectLink(pathname);

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

  if (bypass) return <>{children}</>;

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
