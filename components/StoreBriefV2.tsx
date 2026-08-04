"use client";

import { useEffect, useState } from "react";
import ProductThumb from "@/components/ProductThumb";
import NavTabs from "@/components/NavTabs";

const ACCENT = "#4F46E5";

function man(n: number) {
  return `${(Math.round((n || 0) / 10000 * 10) / 10).toFixed(1)}만원`;
}

function TrendMini({ trend }: { trend: { date: string; amount: number }[] }) {
  if (!trend || !trend.length) return null;
  const max = Math.max(...trend.map((t) => t.amount), 1);
  const w = 560, h = 90;
  const step = w / Math.max(trend.length - 1, 1);
  const points = trend.map((t, i) => `${i * step},${h - (t.amount / max) * (h - 10) - 5}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 90, display: "block" }}>
      <polyline points={points} fill="none" stroke={ACCENT} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CoordinationInline({ styleCode, storeName }: { styleCode: string; storeName: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState("불러오는 중...");

  useEffect(() => {
    fetch(`/api/vmd-directives?store=${encodeURIComponent(storeName)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) {
          setStatus(d.error || "불러오기 실패");
          return;
        }
        const matched = (d.items || []).filter((it: any) => String(it.sku || "").startsWith(styleCode));
        setItems(matched);
        setStatus(matched.length ? "" : "이 매장엔 코디 근거가 아직 없어요.");
      })
      .catch((e) => setStatus(e?.message || "불러오기 실패"));
  }, [styleCode, storeName]);

  return (
    <div style={{ marginTop: 10, background: "#FAFBFF", border: `1.5px dashed ${ACCENT}55`, borderRadius: 14, padding: 14 }}>
      {status && <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>{status}</p>}
      {items.map((it: any, i: number) => (
        <div key={i} style={{ marginBottom: 8 }}>
          {(it.candidates || []).map((c: any, ci: number) => (
            <div key={ci} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
              <ProductThumb styleCode={c.style} size={48} />
              <div style={{ fontSize: 13 }}>
                <strong>{c.style}</strong> · {c.name} <span style={{ color: "#94A3B8" }}>({c.relation} · {c.colorName})</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function UnderperformerCard({ item, storeName }: { item: any; storeName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderRadius: 16, border: "1px solid #EDF0F5", padding: 14, background: "#F8FAFC" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <ProductThumb styleCode={item.styleCode} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{item.productName}</div>
          <div style={{ fontSize: 12, color: "#64748B" }}>{item.styleCode} · 재고 {item.storeStock ?? "-"}개</div>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 13, color: "#334155", lineHeight: 1.6 }}>
        <div>① <strong>진열점검</strong> — 잘 보이는 자리에 나와있는지 확인해주세요.</div>
        <div>② <strong>재고점검</strong> — 재고 {item.storeStock ?? "-"}개, 매장에 실제로 있는지 확인해주세요.</div>
        <div>
          ③ <strong>코디제안</strong> —{" "}
          <button
            onClick={() => setOpen((v) => !v)}
            style={{ color: ACCENT, fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 13, textDecoration: "underline" }}
          >
            {open ? "닫기" : "같이 걸 만한 상품 보기"}
          </button>
        </div>
      </div>
      {open && <CoordinationInline styleCode={item.styleCode} storeName={storeName} />}
    </div>
  );
}

function StockLookupSection({ storeName }: { storeName: string }) {
  const [styleCodeInput, setStyleCodeInput] = useState("");
  const [result, setResult] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [scanning, setScanning] = useState(false);

  async function lookup(params: { styleCode?: string; barcode?: string }) {
    setStatus("조회 중...");
    setResult(null);
    try {
      const qs = new URLSearchParams({ store: storeName, ...(params.styleCode ? { styleCode: params.styleCode } : { barcode: params.barcode || "" }) });
      const res = await fetch(`/api/store-stock-lookup?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "조회 실패");
      if (!data.found) {
        setStatus(data.error || "이 매장 재고에서 못 찾았어요.");
        return;
      }
      setResult(data);
      setStatus("");
    } catch (e: any) {
      setStatus(e?.message || "조회 실패");
    }
  }

  // MARK 6.66: "카메라 켜기"를 누르면 일단 scanning=true로 화면에 #barcode-reader div를
  // 먼저 렌더링시키고, 그 div가 실제로 존재하게 된 다음(useEffect)에 스캐너를 초기화합니다.
  // 예전엔 버튼 클릭 즉시 스캐너를 만들려고 해서, div가 아직 안 그려진 상태라 안드로이드에서
  // "element not found" 오류가 났었습니다.
  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let scannerInstance: any = null;

    async function init() {
      setStatus("카메라 불러오는 중...");
      try {
        if (!(window as any).Html5Qrcode) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("스캐너 라이브러리 로딩 실패"));
            document.body.appendChild(script);
          });
        }
        if (cancelled) return;

        const Html5Qrcode = (window as any).Html5Qrcode;
        const formats = (window as any).Html5QrcodeSupportedFormats;
        // 1차원 바코드(품번 라벨) 위주로 인식하도록 지원 포맷을 명시합니다.
        // (기본 설정이 QR코드 위주로 튜닝되어 있어서, 이걸 안 주면 일반 바코드 인식률이 낮음)
        const formatsToSupport = formats
          ? [
              formats.CODE_128,
              formats.CODE_39,
              formats.CODE_93,
              formats.EAN_13,
              formats.EAN_8,
              formats.UPC_A,
              formats.UPC_E,
              formats.QR_CODE,
            ]
          : undefined;

        const scanner = new Html5Qrcode("barcode-reader", formatsToSupport ? { formatsToSupport } : undefined);
        scannerInstance = scanner;
        (window as any).__markScanner = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 160 }, aspectRatio: 1.4 },
          async (decodedText: string) => {
            try {
              await scanner.stop();
            } catch {}
            setScanning(false);
            setStyleCodeInput(decodedText);
            lookup({ barcode: decodedText.toUpperCase() });
          },
          () => {}
        );
        if (!cancelled) setStatus("");
      } catch (e: any) {
        if (!cancelled) {
          setStatus("카메라를 열 수 없어요: " + (e?.message || e));
          setScanning(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (scannerInstance) scannerInstance.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  function stopScan() {
    setScanning(false);
  }

  return (
    <section
      style={{
        background: "#fff",
        borderRadius: 24,
        padding: 26,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        border: "1px solid #EDF0F5",
        boxShadow: "0 1px 3px rgba(15,23,42,.05)",
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".1em", color: ACCENT }}>실시간재고조회</div>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800 }}>품번으로 컬러별 재고 바로 확인</h2>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <input
          value={styleCodeInput}
          onChange={(e) => setStyleCodeInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup({ styleCode: styleCodeInput })}
          placeholder="품번 입력 (예: GF1LPT501)"
          style={{ flex: 1, padding: "14px 16px", borderRadius: 14, border: "1px solid #E2E8F0", fontSize: 15 }}
        />
        <button
          onClick={() => lookup({ styleCode: styleCodeInput })}
          style={{ padding: "0 22px", borderRadius: 14, border: "none", background: ACCENT, color: "#fff", fontSize: 14, fontWeight: 800 }}
        >
          조회
        </button>
        {!scanning ? (
          <button
            onClick={() => setScanning(true)}
            style={{ padding: "0 20px", borderRadius: 14, border: `1.5px solid ${ACCENT}`, background: "#fff", color: ACCENT, fontSize: 14, fontWeight: 800 }}
          >
            📷 바코드
          </button>
        ) : (
          <button
            onClick={stopScan}
            style={{ padding: "0 20px", borderRadius: 14, border: "1.5px solid #EF4444", background: "#fff", color: "#EF4444", fontSize: 14, fontWeight: 800 }}
          >
            취소
          </button>
        )}
      </div>

      {scanning && <div id="barcode-reader" style={{ width: "100%", maxWidth: 400, margin: "0 auto", borderRadius: 16, overflow: "hidden" }} />}

      {status && <p style={{ fontSize: 13, color: ACCENT, fontWeight: 700 }}>{status}</p>}

      {result && (
        <div>
          <p style={{ fontSize: 15, fontWeight: 800 }}>{result.styleCode} · {result.productName}</p>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
            {result.colors.map((c: any, i: number) => (
              <div
                key={i}
                style={{
                  borderRadius: 14,
                  padding: "14px 16px",
                  background: c.scanned ? `${ACCENT}12` : "#F8FAFC",
                  border: c.scanned ? `1.5px solid ${ACCENT}` : "1px solid #EDF0F5",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>{c.colorName || c.colorCode}</div>
                {c.stock === -1 ? (
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", marginTop: 4 }}>이 매장 정보 없음</div>
                ) : (
                  <div style={{ fontSize: 22, fontWeight: 800, color: c.stock > 0 ? "#059669" : "#DC2626" }}>{c.stock}개</div>
                )}
                {c.stock !== -1 && <div style={{ fontSize: 11, color: "#94A3B8" }}>{c.asOfDate} 기준</div>}
                {c.sizes && c.sizes.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {c.sizes
                      .slice()
                      .sort((a: any, b: any) => a.size.localeCompare(b.size))
                      .map((s: any, si: number) => (
                        <span
                          key={si}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: s.stock > 0 ? "#DCFCE7" : "#FEE2E2",
                            color: s.stock > 0 ? "#166534" : "#991B1B",
                          }}
                        >
                          {s.size} {s.stock}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function StoreBriefV2() {
  const [stores, setStores] = useState<string[]>([]);
  const [storeName, setStoreName] = useState("");
  const [cards, setCards] = useState<any>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch("/api/daily-briefing?stores=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d.ok && setStores(d.stores || []))
      .catch(() => {});
  }, []);

  async function loadStore(name: string) {
    setStoreName(name);
    setCards(null);
    if (!name) return;
    setStatus("불러오는 중...");
    try {
      const res = await fetch(`/api/store-cards?store=${encodeURIComponent(name)}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "불러오기 실패");
      setCards(data.cards);
      setStatus("");
    } catch (e: any) {
      setStatus(e?.message || "불러오기 실패");
    }
  }

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 24,
    padding: 26,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    border: "1px solid #EDF0F5",
    boxShadow: "0 1px 3px rgba(15,23,42,.05)",
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, letterSpacing: ".1em", color: ACCENT };
  const h2Style: React.CSSProperties = { margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: "-.01em", lineHeight: 1.4 };

  return (
    <main style={{ minHeight: "100vh", background: "#F7F8FA", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 820, padding: "24px 20px 80px", display: "flex", flexDirection: "column", gap: 18 }}>
        <NavTabs active="store" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".14em", color: ACCENT }}>매장 아침 브리핑 (가안)</div>
          <select
            value={storeName}
            onChange={(e) => loadStore(e.target.value)}
            style={{ marginTop: 8, width: "100%", padding: 14, borderRadius: 14, border: "1px solid #E2E8F0", background: "#fff", fontSize: 16 }}
          >
            <option value="">매장을 선택해 주세요</option>
            {stores.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {status && <p style={{ fontSize: 13, color: ACCENT, fontWeight: 700 }}>{status}</p>}

        {cards && (
          <>
            {/* A. 어제 매출 */}
            <section style={cardStyle}>
              <div>
                <div style={labelStyle}>오늘의 브리핑</div>
                <h2 style={h2Style}>좋은 아침입니다, {storeName} 👋</h2>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <div style={{ flex: "1.3 1 210px", background: ACCENT, borderRadius: 18, padding: "20px 22px", color: "#fff" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.85 }}>어제 매출</div>
                  <div style={{ fontSize: 34, fontWeight: 800 }}>{man(cards.trend?.[cards.trend.length - 1]?.amount || 0)}</div>
                </div>
                <div style={{ flex: "2 1 280px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(148px,1fr))", gap: 10 }}>
                  <div style={{ background: "#F8FAFC", border: "1px solid #EDF0F5", borderRadius: 18, padding: "16px 12px" }}>
                    <div style={{ fontSize: 13, color: "#64748B", fontWeight: 600 }}>이번 주 누계</div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{man(cards.week?.cumulative || 0)}</div>
                  </div>
                  <div style={{ background: "#F8FAFC", border: "1px solid #EDF0F5", borderRadius: 18, padding: "16px 12px" }}>
                    <div style={{ fontSize: 13, color: "#64748B", fontWeight: 600 }}>이번 달 누계</div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{man(cards.month?.cumulative || 0)}</div>
                  </div>
                </div>
              </div>
              <div style={{ background: "#F8FAFC", border: "1px solid #EDF0F5", borderRadius: 18, padding: "16px 18px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>최근 14일 매출 추이</div>
                <TrendMini trend={cards.trend || []} />
              </div>
            </section>

            {/* B. 월목표 게이지 (간단 버전) */}
            <section style={cardStyle}>
              <div>
                <div style={labelStyle}>이번 달 진척</div>
                <h2 style={h2Style}>
                  월 목표 달성률 {cards.month?.targetEstimate ? Math.round((cards.month.cumulative / cards.month.targetEstimate) * 100) : "-"}%
                </h2>
              </div>
              <div style={{ height: 14, background: `${ACCENT}14`, borderRadius: 999, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${cards.month?.targetEstimate ? Math.min(100, (cards.month.cumulative / cards.month.targetEstimate) * 100) : 0}%`,
                    background: `linear-gradient(90deg,#6366F1,${ACCENT})`,
                    borderRadius: 999,
                  }}
                />
              </div>
            </section>

            {/* 날씨 팁 */}
            {cards.weatherTip && (
              <section style={{ ...cardStyle, background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ fontSize: 20 }}>{cards.weatherTip.icon}</div>
                  <div style={{ fontSize: 14, color: "#92400E", lineHeight: 1.6 }}>
                    <strong>오늘 날씨 기반 제안</strong> — {cards.weatherTip.text}
                  </div>
                </div>
              </section>
            )}

            {/* C. 베스트와 재고 워닝 */}
            <section style={cardStyle}>
              <div>
                <div style={labelStyle}>어제 우리 매장 베스트</div>
                <h2 style={h2Style}>TOP10 & 재고 워닝</h2>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(cards.top10Comparison || []).slice(0, 5).map((it: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "#F8FAFC", borderRadius: 14 }}>
                    <ProductThumb styleCode={it.styleCode} size={48} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{it.productName}</div>
                      <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                        판매량 {it.storeQty ?? 0}개 · 재고 {it.storeStock ?? "-"}개
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: it.storeRank ? "#059669" : "#94A3B8" }}>
                      {it.storeRank ? `이 매장 ${it.storeRank}위` : "미판매"}
                    </div>
                  </div>
                ))}
              </div>
              {(cards.stockInsights || []).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#334155" }}>재고 부족 워닝</div>
                  {cards.stockInsights.map((s: any, i: number) => (
                    <div key={i} style={{ display: "flex", gap: 10, background: "#FFF1F2", borderRadius: 14, padding: "12px 14px" }}>
                      <div style={{ fontSize: 13, color: "#9F1239", lineHeight: 1.55 }}>
                        <strong>{s.productName}</strong> — {s.suggestion}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 유독 잘 팔리는 상품 */}
            {(cards.storeOutperformers || []).length > 0 && (
              <section style={cardStyle}>
                <div>
                  <div style={labelStyle}>우리 매장 특화</div>
                  <h2 style={h2Style}>우리 매장에서 유독 잘 팔리는 상품</h2>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {cards.storeOutperformers.map((it: any, i: number) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "#ECFDF5", borderRadius: 14 }}>
                      <ProductThumb styleCode={it.styleCode} size={48} />
                      <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{it.productName}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#059669" }}>전사 평균 {it.ratio.toFixed(1)}배</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 유독 안 팔리는 상품 → 진열점검 → 재고점검 → 코디제안 */}
            {(cards.stockInsights || []).length > 0 && (
              <section style={cardStyle}>
                <div>
                  <div style={labelStyle}>확인이 필요해요</div>
                  <h2 style={h2Style}>우리 매장에서 유독 안 팔리는 상품</h2>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748B" }}>재고 10개 미만인 상품은 전개가 어려워서 제외했어요.</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {cards.stockInsights.map((s: any, i: number) => (
                    <UnderperformerCard key={i} item={s} storeName={storeName} />
                  ))}
                </div>
              </section>
            )}

            {/* 최근 입고 신상품 */}
            {(cards.recentArrivals || []).length > 0 && (
              <section style={cardStyle}>
                <div>
                  <div style={labelStyle}>최근 입고</div>
                  <h2 style={h2Style}>최근 입고된 신상품</h2>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
                  {cards.recentArrivals.map((it: any, i: number) => (
                    <div key={i} style={{ borderRadius: 16, border: "1px solid #EDF0F5", background: "#F8FAFC", overflow: "hidden" }}>
                      <ProductThumb styleCode={it.styleCode} size={150} />
                      <div style={{ padding: "10px 12px" }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{it.productName}</div>
                        <div style={{ fontSize: 11, color: "#64748B" }}>입고 {it.launchDate} · 재고 {it.storeStock}개</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <StockLookupSection storeName={storeName} />

            {/* F. 소통 게시판 - 틀만 */}
            <section style={{ ...cardStyle, opacity: 0.6 }}>
              <div>
                <div style={labelStyle}>본사 ↔ 매장 소통 (준비 중)</div>
                <h2 style={h2Style}>여기서 본사에 문의·요청할 수 있게 될 예정이에요</h2>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <input disabled placeholder="본사에 요청·문의 남기기 (준비 중)" style={{ flex: 1, padding: "14px 16px", borderRadius: 14, border: "1px solid #E2E8F0", fontSize: 14 }} />
                <button disabled style={{ padding: "0 22px", borderRadius: 14, border: "none", background: "#CBD5E1", color: "#fff", fontSize: 14, fontWeight: 800 }}>보내기</button>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
