"use client";

// MARK 2026-11-19: 페이지 안 하위 탭(상품: IMC/주간데이터/구성비, 매출: 점포별/일별…)을 메뉴바로 올려 보여줌.
// NavTabs가 만들어 둔 #sidenav-sub-desktop(PC 왼쪽 메뉴, 선택 메뉴 밑) / #sidenav-sub-mobile(모바일 위쪽 둘째 줄)에 포털로 넣고,
// 그 자리가 없으면(메뉴 없는 화면) 원래처럼 본문에 버튼 줄로 보여줌.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function SideSubTabs<K extends string>({
  items,
  active,
  onPick,
}: {
  items: readonly (readonly [K, string])[];
  active: K;
  onPick: (k: K) => void;
}) {
  const [targets, setTargets] = useState<{ d: HTMLElement | null; m: HTMLElement | null } | null>(null);
  useEffect(() => {
    // 모바일 메뉴는 NavTabs가 마운트 뒤 포털로 붙이므로 잠깐 기다렸다 찾음(최대 2초)
    let n = 0;
    const find = () => {
      const d = document.getElementById("sidenav-sub-desktop"), m = document.getElementById("sidenav-sub-mobile");
      if ((d && m) || n++ > 20) setTargets({ d, m });
      else timer = setTimeout(find, 100);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    find();
    return () => clearTimeout(timer);
  }, []);

  if (!targets) return null;
  if (!targets.d && !targets.m) {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        {items.map(([k, label]) => (
          <button key={k} type="button" onClick={() => onPick(k)} className={`rounded-xl px-4 py-2 text-sm font-black ${active === k ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>
            {label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <>
      {targets.d &&
        createPortal(
          <>
            {items.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => onPick(k)}
                className={`block w-full rounded-lg px-3 py-1.5 text-left text-[13px] font-bold ${active === k ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
              >
                {active === k ? "• " : ""}
                {label}
              </button>
            ))}
          </>,
          targets.d
        )}
      {targets.m &&
        createPortal(
          <>
            {items.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => onPick(k)}
                className={`shrink-0 rounded-lg px-3 py-1 text-[12px] font-bold ${active === k ? "bg-white text-slate-900" : "text-slate-300"}`}
              >
                {label}
              </button>
            ))}
          </>,
          targets.m
        )}
    </>
  );
}
