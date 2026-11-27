import { Suspense } from "react";
import NavTabs from "@/components/NavTabs";
import ReviewViewer from "@/components/ReviewViewer";

// MARK 2026-11-27: 매출 리뷰(카톡 "자세히 보기") — 일간/주간, 지난 리뷰, 소리내어 읽기
export default function Page() {
  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <div className="mx-auto max-w-[900px] px-4 pt-6">
        <NavTabs active="review" />
        <Suspense fallback={null}>
          <ReviewViewer />
        </Suspense>
      </div>
    </main>
  );
}
