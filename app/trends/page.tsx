import NavTabs from "@/components/NavTabs";
import TrendsDashboard from "@/components/TrendsDashboard";

export default function Page() {
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">상품동향</h1>
            <p className="mt-1 text-sm text-slate-500">매장 주간 상품 레포트를 채널유형별로 정리합니다.</p>
          </div>
          <NavTabs active="trends" />
        </header>

        <TrendsDashboard />
      </div>
    </main>
  );
}
