"use client";

import { useEffect, useMemo, useState } from "react";

function text(value: any) {
  return String(value ?? "").trim();
}

function short(value: string, max = 130) {
  const s = text(value).replace(/\n{2,}/g, " / ");
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{children}</span>;
}

function MiniInsight({ title, items }: { title: string; items: any[] }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-black text-slate-900">{title}</h3>
      <div className="mt-3 space-y-3">
        {items?.length ? items.slice(0, 4).map((item, idx) => (
          <div key={`${item.productName}-${idx}`} className="rounded-2xl bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-black text-white">{item.channelType}</span>
              <p className="text-xs font-black text-slate-900">{item.productName}</p>
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{short(item.text, 115)}</p>
          </div>
        )) : (
          <p className="text-sm font-semibold text-slate-400">표시할 내용이 없습니다.</p>
        )}
      </div>
    </div>
  );
}

export default function TrendsDashboard() {
  const [data, setData] = useState<any>(null);
  const [channel, setChannel] = useState("전체");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentMessage, setAgentMessage] = useState("");
  const [agentPendingRequestId, setAgentPendingRequestId] = useState("");
  const [agentNote, setAgentNote] = useState("");
  const [agentResult, setAgentResult] = useState<any>(null);
  const [agentResultLoading, setAgentResultLoading] = useState(false);

  useEffect(() => {
    fetch("/api/trends", { cache: "no-store" })
      .then((res) => res.json())
      .then(setData)
      .catch((err) => setData({ source: "error", error: String(err), productSummary: [], items: [] }));
  }, []);

  async function loadAgentResult() {
    setAgentResultLoading(true);
    try {
      const res = await fetch("/api/trends-agent", { cache: "no-store" });
      const json = await res.json();
      const latest = json?.latest || null;
      setAgentResult(latest);
      if (agentPendingRequestId && latest?.requestId === agentPendingRequestId) {
        setAgentPendingRequestId("");
        setAgentMessage(`새 AI 분석 결과 반영 완료: ${latest.requestId}`);
      }
      return latest;
    } catch {
      setAgentResult(null);
      return null;
    } finally {
      setAgentResultLoading(false);
    }
  }

  useEffect(() => {
    loadAgentResult();
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

  async function requestAgentAnalysis() {
    if (!data || agentLoading) return;
    setAgentLoading(true);
    setAgentMessage("");

    try {
      const res = await fetch("/api/trends-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          items: data.productSummary || [],
          channelSummary: data.channelSummary || [],
          headlineInsights: data.headlineInsights || {},
          note: agentNote,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Agent 요청 실패");
      setAgentPendingRequestId(json.requestId || "");
      setAgentMessage(`Agent 분석 요청 등록 완료: ${json.requestId}. 새 결과가 저장되기 전까지는 기존 최신 분석이 계속 표시됩니다.`);
      setAgentNote("");
      // Agent 실행과 Trend_Summary 저장은 비동기로 진행되므로 기존 결과를 유지합니다.
      // 저장 완료 후 'AI 결과 새로고침'을 누르면 최신 Trend_Summary가 반영됩니다.
    } catch (err: any) {
      setAgentMessage(`Agent 분석 요청 실패: ${err?.message || String(err)}`);
    } finally {
      setAgentLoading(false);
    }
  }

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
      <section className="rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-slate-950">AI INSIGHT</span>
              {agentResult?.createdAt ? <span className="text-xs font-bold text-slate-400">최근 분석: {agentResult.createdAt}</span> : null}
              {agentResult?.requestId ? <span className="text-xs font-bold text-slate-400">요청ID: {agentResult.requestId}</span> : null}
              {agentResult ? <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-black text-slate-300">저장된 최신 분석 표시 중</span> : null}
              {agentPendingRequestId ? <span className="rounded-full bg-amber-300 px-2.5 py-1 text-xs font-black text-slate-950">새 분석 대기: {agentPendingRequestId}</span> : null}
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-tight">AI 상품동향 분석</h2>
            <div className="mt-4 min-h-[180px] rounded-3xl bg-white/10 p-5">
              {agentResultLoading ? (
                <p className="text-sm font-bold text-slate-300">AI 분석 결과 불러오는 중...</p>
              ) : agentResult?.executiveSummary || agentResult?.rawSummary ? (
                <div className="space-y-5">
                  {agentResult.week ? (
                    <p className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-black text-emerald-200">{agentResult.week}</p>
                  ) : null}

                  {agentResult.executiveSummary ? (
                    <div>
                      <h3 className="text-sm font-black text-emerald-200">이번주 핵심 요약</h3>
                      <pre className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-7 text-slate-100">{agentResult.executiveSummary}</pre>
                    </div>
                  ) : null}

                  <div className="grid gap-4 lg:grid-cols-2">
                    {agentResult.keyProducts ? (
                      <div className="rounded-2xl bg-white/10 p-4">
                        <h3 className="text-sm font-black text-sky-200">핵심 상품</h3>
                        <pre className="mt-2 whitespace-pre-wrap break-words text-xs font-semibold leading-6 text-slate-100">{agentResult.keyProducts}</pre>
                      </div>
                    ) : null}

                    {agentResult.risks ? (
                      <div className="rounded-2xl bg-white/10 p-4">
                        <h3 className="text-sm font-black text-rose-200">리스크</h3>
                        <pre className="mt-2 whitespace-pre-wrap break-words text-xs font-semibold leading-6 text-slate-100">{agentResult.risks}</pre>
                      </div>
                    ) : null}

                    {agentResult.recommendedActions ? (
                      <div className="rounded-2xl bg-white/10 p-4">
                        <h3 className="text-sm font-black text-amber-200">추천 액션</h3>
                        <pre className="mt-2 whitespace-pre-wrap break-words text-xs font-semibold leading-6 text-slate-100">{agentResult.recommendedActions}</pre>
                      </div>
                    ) : null}

                    {agentResult.rtCandidates ? (
                      <div className="rounded-2xl bg-white/10 p-4">
                        <h3 className="text-sm font-black text-violet-200">RT 검토 후보</h3>
                        <pre className="mt-2 whitespace-pre-wrap break-words text-xs font-semibold leading-6 text-slate-100">{agentResult.rtCandidates}</pre>
                      </div>
                    ) : null}
                  </div>

                  {!agentResult.executiveSummary && agentResult.rawSummary ? (
                    <pre className="whitespace-pre-wrap break-words text-sm font-semibold leading-7 text-slate-100">{agentResult.rawSummary}</pre>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-lg font-black text-slate-100">아직 표시할 AI 상품동향 요약이 없습니다.</p>
                  <p className="text-sm font-semibold leading-6 text-slate-300">
                    아래 버튼으로 상품동향 분석 요청을 등록하면 Trend_Summary에 저장된 최신 결과가 이 영역에 표시됩니다. 새 결과가 나오기 전까지는 기존 분석 화면이 유지됩니다.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="w-full rounded-3xl bg-white p-5 text-slate-900 lg:w-[360px]">
            <h3 className="text-sm font-black">Agent 분석 요청</h3>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
              새 분석 요청만 등록합니다. 화면은 Trend_Summary에 저장된 최신 결과를 계속 표시합니다.
            </p>
            <textarea
              value={agentNote}
              onChange={(e) => setAgentNote(e.target.value)}
              placeholder="추가 요청사항이 있으면 입력"
              className="mt-4 h-24 w-full rounded-2xl border border-slate-200 p-3 text-xs font-semibold outline-none focus:border-slate-400"
            />
            <button
              type="button"
              onClick={requestAgentAnalysis}
              disabled={agentLoading}
              className="mt-3 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {agentLoading ? "Agent 요청 중..." : "상품동향 Agent 분석 요청"}
            </button>
            <button
              type="button"
              onClick={loadAgentResult}
              disabled={agentResultLoading}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              {agentResultLoading ? "새로고침 중..." : "AI 결과 새로고침"}
            </button>
            {agentMessage ? (
              <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-black text-slate-600">{agentMessage}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black text-slate-400">MARK_DB PRODUCT VOICE</p>
            <h2 className="mt-2 text-2xl font-black">상품동향 요약</h2>
            <p className="mt-2 text-sm font-semibold text-slate-300">매장 주간 상품 레포트를 채널유형별로 압축 정리합니다.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center sm:grid-cols-5">
            <div>
              <p className="text-2xl font-black">{data.reportSheets?.length || 0}</p>
              <p className="text-[11px] font-bold text-slate-400">레포트</p>
            </div>
            <div>
              <p className="text-2xl font-black">{data.items?.length || 0}</p>
              <p className="text-[11px] font-bold text-slate-400">언급</p>
            </div>
            <div>
              <p className="text-2xl font-black">{data.productSummary?.length || 0}</p>
              <p className="text-[11px] font-bold text-slate-400">상품</p>
            </div>
            <div>
              <p className="text-2xl font-black">{data.channelTypes?.length || 0}</p>
              <p className="text-[11px] font-bold text-slate-400">채널</p>
            </div>
            <div>
              <p className="text-2xl font-black">{data.channelSummary?.reduce((a: number, b: any) => a + (b.issueCount || 0), 0) || 0}</p>
              <p className="text-[11px] font-bold text-slate-400">이슈</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {(data.channelSummary || []).map((item: any) => (
          <button
            key={item.channelType}
            type="button"
            onClick={() => setChannel(item.channelType)}
            className={`rounded-3xl border p-5 text-left shadow-sm transition ${
              channel === item.channelType ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <p className={`text-sm font-black ${channel === item.channelType ? "text-white" : "text-slate-900"}`}>{item.channelType}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xl font-black">{item.mentionCount}</p>
                <p className={`text-[10px] font-bold ${channel === item.channelType ? "text-slate-300" : "text-slate-400"}`}>언급</p>
              </div>
              <div>
                <p className="text-xl font-black">{item.productCount}</p>
                <p className={`text-[10px] font-bold ${channel === item.channelType ? "text-slate-300" : "text-slate-400"}`}>상품</p>
              </div>
              <div>
                <p className="text-xl font-black">{item.issueCount}</p>
                <p className={`text-[10px] font-bold ${channel === item.channelType ? "text-slate-300" : "text-slate-400"}`}>이슈</p>
              </div>
            </div>
          </button>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <MiniInsight title="재고/조치 필요" items={data.headlineInsights?.urgent || []} />
        <MiniInsight title="판매 반응 우수" items={data.headlineInsights?.positive || []} />
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-black text-slate-900">AI 분석 영역 이동</h3>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
            Agent 분석 결과와 요청 버튼은 최상단 AI 상품동향 분석 영역으로 이동했습니다.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">상세 상품 리스트</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">상품별 상세 코멘트는 클릭해서 펼쳐봅니다.</p>
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

      <section className="grid gap-3">
        {products.map((item: any) => {
          const isOpen = expanded === item.productName;
          const preview = item.comments?.[0];
          return (
            <article key={item.productName} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : item.productName)}
                className="w-full text-left"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{item.productName}</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Pill>언급 {item.mentionCount}건</Pill>
                      {(item.channelTypes || []).map((c: string) => <Pill key={c}>{c}</Pill>)}
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-900 px-3 py-2 text-xs font-black text-white">
                    {isOpen ? "접기" : "상세보기"}
                  </span>
                </div>
                {preview ? (
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                    {short(preview.salesReaction || preview.actionPlan || preview.targetReaction, 180)}
                  </p>
                ) : null}
              </button>

              {isOpen ? (
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
                          {c.salesReaction}
                        </p>
                      ) : null}
                      {c.targetReaction ? (
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                          <span className="font-black text-slate-900">타겟반응 </span>
                          {c.targetReaction}
                        </p>
                      ) : null}
                      {c.actionPlan ? (
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                          <span className="font-black text-slate-900">조치사항 </span>
                          {c.actionPlan}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}

        {!products.length ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-lg font-black text-slate-700">표시할 상품동향이 없습니다.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
