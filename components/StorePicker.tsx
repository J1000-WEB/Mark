"use client";

// MARK 2026-11-20: 매장 여러 개 고르기(칩). 아무것도 안 고르면 = 전체 매장.
export type PickStore = { code: string; name: string; grade?: string };

export default function StorePicker({ stores, value, onChange, presets, label = "매장" }: {
  stores: PickStore[];
  value: string[];
  onChange: (v: string[]) => void;
  presets?: { label: string; codes: string[] }[];
  label?: string;
}) {
  const on = new Set(value);
  const toggle = (c: string) => onChange(on.has(c) ? value.filter((x) => x !== c) : [...value, c]);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const chip = (active: boolean) => `rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600"}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-black text-slate-500">{label}</span>
      <button type="button" className={chip(value.length === 0)} onClick={() => onChange([])}>전체 매장</button>
      {(presets || []).map((p) => (
        <button key={p.label} type="button" className={chip(same(value, p.codes))} onClick={() => onChange(p.codes)}>{p.label}</button>
      ))}
      <span className="mx-0.5 h-4 w-px bg-slate-200" />
      {stores.map((s) => (
        <button key={s.code} type="button" className={chip(on.has(s.code))} onClick={() => toggle(s.code)} title={`${s.code}${s.grade ? ` · ${s.grade}등급` : ""}`}>
          {s.name}
          {s.grade && <span className="ml-0.5 opacity-50">{s.grade}</span>}
        </button>
      ))}
      {value.length > 0 && <span className="text-[11px] font-semibold text-slate-400">{value.length}개 선택</span>}
    </div>
  );
}
