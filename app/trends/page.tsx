import NavTabs from "@/components/NavTabs";

export default function Page() {
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">상품동향</h1>
            <p className="mt-1 text-sm text-slate-500">상품 판매 흐름 분석 영역입니다.</p>
          </div>
          <NavTabs active="trends" />
        </header>

        <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <p className="text-2xl font-black text-slate-800">상품동향 준비중</p>
          <p className="mt-3 text-sm font-semibold text-slate-500">MARK 4.80에서 TOP 상품 추이, 순위 변동, RT 실행 상품 추적을 연결할 예정입니다.</p>
        </section>
      </div>
    </main>
  );
}
