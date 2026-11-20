import NavTabs from "@/components/NavTabs";
import MeetingBoard from "@/components/MeetingBoard";

// MARK 2026-11-20: 회의 탭 — 주간 리더회의 한 장(지난주/이번주/이번달) 자동 초안 + PDF
export default function Page() {
  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <div className="mx-auto max-w-[1600px] px-4 pt-6">
        <NavTabs active="meeting" />
        <MeetingBoard />
      </div>
    </main>
  );
}
