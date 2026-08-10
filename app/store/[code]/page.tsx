import StoreBriefV2 from "@/components/StoreBriefV2";
import { getStoreCodeNameMap } from "@/lib/dataBuilder";

export const dynamic = "force-dynamic";

// MARK 6.83: 매장 직원용 개별 배포 링크 — /store/21030 처럼 매장 코드로 접속하면
// 그 매장 브리핑만 고정으로 보여줍니다 (드롭다운/다른 탭 없음).
// 로그인 우회는 components/AuthGate.tsx에서 이 경로(/store/[아무거나])를 감지해서 처리합니다.
export default async function StoreCodePage({ params }: { params: { code: string } }) {
  const code = params.code;
  const map = await getStoreCodeNameMap().catch(() => new Map<string, string>());
  const storeName = map.get(code) || "";

  if (!storeName) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F8FA", padding: 24 }}>
        <div style={{ textAlign: "center", color: "#64748B" }}>
          <p style={{ fontWeight: 800, fontSize: 16 }}>매장 코드를 찾지 못했어요.</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>코드({code})가 맞는지 확인해주세요.</p>
        </div>
      </main>
    );
  }

  return <StoreBriefV2 fixedStoreName={storeName} hideStoreSwitcher hideNavTabs />;
}
