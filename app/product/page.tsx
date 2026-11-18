import NavTabs from "@/components/NavTabs";
import ProductTabs from "@/components/ProductTabs";

// MARK 2026-11-17: 상품 탭 — 프로모션 결과(주간 IMC) 등 상품 단위 리포트. 매출탭에서 옮겨 옴.
export default function Page() {
  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <div className="mx-auto max-w-[1600px] px-4 pt-6">
        <NavTabs active="product" />
        <ProductTabs />
      </div>
    </main>
  );
}
