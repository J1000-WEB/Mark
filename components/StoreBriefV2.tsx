"use client";

import { Component, useEffect, useState } from "react";
import ProductThumb from "@/components/ProductThumb";
import NavTabs from "@/components/NavTabs";

const ACCENT = "#4F46E5";

// MARK 6.68: 바코드 스캔 중 예상 못한 오류가 나도, 화면 전체가 죽지 않고 이 섹션만
// 에러 메시지로 대체되도록 하는 안전장치. (예전엔 크래시 나면 뒤로가기도 안 먹혀서
// 답답한 상황이 됐었음 — 최소한 나머지 화면은 계속 쓸 수 있게)
class ScanErrorBoundary extends Component<{ children: any }, { error: string | null }> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { error: error?.message || String(error) || "알 수 없는 오류" };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, borderRadius: 14, background: "#FEF2F2", border: "1px solid #FCA5A5", fontSize: 13, color: "#991B1B" }}>
          ⚠ 바코드 스캔 화면에서 오류가 났어요: {this.state.error}
          <br />
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 8, padding: "6px 14px", borderRadius: 10, border: "1px solid #FCA5A5", background: "#fff", color: "#991B1B", fontWeight: 700 }}
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// MARK 6.72: 재고 마지막 갱신 시각을 "8/5 15:02" 형태로 표시합니다.
function formatStockUpdatedAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const parts = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
    return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
  } catch {
    return "";
  }
}

// MARK 6.74: 사이즈 표시 순서를 S,M,L,XL,F 순으로 정렬합니다. (기존엔 그냥 알파벳순이라
// F,L,M,S,XL로 뒤죽박죽 나왔음 — daily-snapshot.js의 SIZE_SLOT_MAP은 저장용 슬롯 순서일 뿐,
// 화면 표시 순서는 따로 정해야 해서 여기서 정렬 규칙을 둡니다.)
const SIZE_DISPLAY_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "F"];
function sizeSortRank(size: string): number {
  const s = String(size || "").trim().toUpperCase();
  const idx = SIZE_DISPLAY_ORDER.indexOf(s);
  if (idx >= 0) return idx;
  // 숫자 사이즈(신발 등)는 숫자값 순으로, 목록에 없는 문자 사이즈는 맨 뒤로
  const n = Number(s);
  if (Number.isFinite(n) && s !== "") return 1000 + n;
  return 9999;
}

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
    // MARK 6.69: html5-qrcode는 이미 멈춘(혹은 아직 시작 안 한) 스캐너에 stop()을 또 부르면
    // "Cannot stop, scanner is not running or paused"를 던지는데, 이게 프라미스 reject가
    // 아니라 동기(synchronous) throw라서 .catch()로 못 잡고 React effect cleanup 중
    // 예외로 튀어서 Error Boundary까지 뚫고 올라왔었습니다. stopped 플래그로 중복 호출
    // 자체를 막고, 혹시 몰라 safeStop도 try/catch + isScanning 체크로 이중 방어합니다.
    let stopped = false;

    function safeStop(scanner: any) {
      if (!scanner || stopped) return;
      stopped = true;
      try {
        // getState()가 있으면 실행 중일 때만 stop 시도 (버전에 따라 없을 수도 있어 optional)
        if (typeof scanner.getState === "function" && typeof (window as any).Html5QrcodeScannerState === "object") {
          const state = scanner.getState();
          const SCANNING = (window as any).Html5QrcodeScannerState?.SCANNING;
          if (SCANNING !== undefined && state !== SCANNING) return;
        }
        const p = scanner.stop();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {
        // 이미 멈춘 상태에서 동기적으로 던지는 경우 — 무시해도 안전 (원하는 목적은 이미 달성됨)
      }
    }

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
        const scanner = new Html5Qrcode("barcode-reader");
        scannerInstance = scanner;
        (window as any).__markScanner = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 280, height: 160 },
            aspectRatio: 1.4,
            // MARK 6.71: 아이폰(iOS Safari)에서 기본 해상도가 낮게 잡혀서 CODE128 바코드를
            // 가끔 엉뚱한 특수문자로 오독하는 문제가 있었습니다 (예: F→', L→", 매번 다르게).
            // 해상도를 명시적으로 높게 요청해서 프레임 화질을 개선합니다.
            videoConstraints: {
              facingMode: "environment",
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          async (decodedText: string) => {
            try {
              // MARK 6.71: 실제 품번 바코드는 항상 대문자+숫자만 있습니다. 화질 문제로
              // 오독되면 ', ", ), * 같은 특수문자가 섞여 나오는데, 이걸 그대로 조회해버리면
              // 엉뚱한 결과가 뜨니까 — 이런 값은 무시하고 스캔을 계속합니다(멈추지 않음).
              const cleaned = decodedText.toUpperCase().trim();
              if (!/^[A-Z0-9]+$/.test(cleaned)) {
                setStatus("바코드를 다시 읽는 중이에요... (인식이 불안정하면 조금 더 가까이/멀리 대보세요)");
                return; // 스캐너는 멈추지 않고 계속 시도
              }
              safeStop(scanner);
              setScanning(false);
              setStyleCodeInput(cleaned);
              lookup({ barcode: cleaned });
            } catch (scanErr: any) {
              setStatus("스캔 처리 중 오류: " + (scanErr?.message || scanErr));
              setScanning(false);
            }
          },
          () => {}
        );
        if (!cancelled) setStatus("");
      } catch (e: any) {
        if (!cancelled) {
          const name = e?.name || "";
          let friendly = e?.message || String(e);
          if (name === "NotAllowedError") friendly = "카메라 권한이 차단되어 있어요. 브라우저 설정에서 카메라 권한을 허용해주세요.";
          else if (name === "NotFoundError") friendly = "이 기기에서 카메라를 찾지 못했어요.";
          else if (name === "NotReadableError") friendly = "카메라가 다른 앱에서 사용 중일 수 있어요. 다른 카메라 앱을 닫고 다시 시도해주세요.";
          setStatus("카메라를 열 수 없어요: " + friendly);
          setScanning(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      safeStop(scannerInstance);
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
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{result.styleCode} · {result.productName}</p>
            {result.stockUpdatedAt && (
              <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>
                재고 갱신: {formatStockUpdatedAt(result.stockUpdatedAt)}
              </span>
            )}
          </div>
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
                      .sort((a: any, b: any) => sizeSortRank(a.size) - sizeSortRank(b.size))
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

            <ScanErrorBoundary>
              <StockLookupSection storeName={storeName} />
            </ScanErrorBoundary>

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
