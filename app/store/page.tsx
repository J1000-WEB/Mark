"use client";

import NavTabs from "@/components/NavTabs";
import StoreDashboard from "@/components/StoreDashboard";

export default function StorePage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black text-slate-400">STORE VIEW</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">매장</h1>
        </div>
        <NavTabs active="store" />
      </header>

      <StoreDashboard />
    </main>
  );
}
