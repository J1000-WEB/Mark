import NavTabs from "@/components/NavTabs";

export default function Page() {
  return (
    <main className="p-6">
      <NavTabs active="trends" />
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
        상품동향 (준비중)
      </div>
    </main>
  );
}
