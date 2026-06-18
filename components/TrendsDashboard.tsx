"use client";

import { useEffect, useMemo, useState } from "react";

function text(value: any) {
  return String(value ?? "").trim();
}

function short(value: string, max = 180) {
  const s = text(value);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{children}</span>;
}

export default function TrendsDashboard() {
  const [data, setData] = useState<any>(null);
  const [channel, setChannel] = useState("전체");
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/trends", { cache: "no-store" })
      .then((res) => res.json())
      .then(setData)
      .catch((err) => setData({ source: "error", error: String(err), productSummary: [], items: [] }));
  }, []);

  const products = useMemo(() => {
    const list = data?.productSummary || [];
    return list.filter((item: any) => {
      const channelMatched = channel === "전체" || item.channelTypes?.includes(channel);
      const q = query.trim().toLowerCase();
      const queryMatched = !q || text(item.productName).toLowerCase().includes(q);
      return channelMatched && queryMatched;
    });
  }, [data, channel, query]);

  if (!data) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-lg font-black text-slate-700">상품동향 불러오는 중...</p>
      </section>
    );
  }

  if (data.error) {
    return (
      <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
        <p className="text-lg font-black text-rose-700">상품동향 데이터를 불러오지 못했습니다.</p>
        <p className="mt-2 text-sm font-semibold text-rose-600">{data.error}</p>
        <p className="mt-3 text-xs font-bold text-rose-500">Vercel 환경변수 GOOGLE_SHEET_ID_DB와 MARK_DB 공유 권한을 확인하세요.</p>
      </section>
    );
  }

  const channels = ["전체", ...(data.channelTypes || [])];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black text-slate-400">레포트 시트</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{data.reportSheets?.length || 0}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black text-slate-400">상품 언급</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{data.items?.length || 0}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black text-slate-400">상품 수</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{data.productSummary?.length || 0}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black text-slate-400">채널유형</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{data.channelTypes?.length || 0}</p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">상품동향</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">MARK_DB 상품 레포트 시트를 채널유형별로 정리합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {channels.map((c: string) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`rounded-full px-3 py-2 text-xs font-black transition ${
                  channel === c ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="상품명 검색"
          className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-slate-400"
        />
      </section>

      <section className="grid gap-4">
        {products.map((item: any) => (
          <article key={item.productName} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">{item.productName}</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Pill>언급 {item.mentionCount}건</Pill>
                  {(item.channelTypes || []).map((c: string) => <Pill key={c}>{c}</Pill>)}
                  {(item.weeks || []).slice(0, 2).map((w: string) => <Pill key={w}>{w}</Pill>)}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {(item.comments || []).map((c: any, idx: number) => (
                <div key={idx} className="rounded-2xl bg-slate-50 p-4">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Pill>{c.channelType}</Pill>
                    {c.week ? <Pill>{c.week}</Pill> : null}
                    {c.storeScope ? <Pill>{c.storeScope}</Pill> : null}
                  </div>
                  {c.salesReaction ? (
                    <p className="text-sm font-semibold leading-6 text-slate-700">
                      <span className="font-black text-slate-900">판매반응 </span>
                      {short(c.salesReaction)}
                    </p>
                  ) : null}
                  {c.targetReaction ? (
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                      <span className="font-black text-slate-900">타겟반응 </span>
                      {short(c.targetReaction)}
                    </p>
                  ) : null}
                  {c.actionPlan ? (
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                      <span className="font-black text-slate-900">조치사항 </span>
                      {short(c.actionPlan)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        ))}

        {!products.length ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-lg font-black text-slate-700">표시할 상품동향이 없습니다.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
