import data from "@/data/mark1.json";
import { Card, Header, Kpi, Mini, comma, pct, signPct, tone, won } from "@/components/ui";

function forecast(total: any) {
  // Mark1 리더회의판은 월 누적 실적이 이미 들어오므로, 초기 버전에서는 금주 목표 대비 속도를 월 누적 착지예측 참고값으로 둔다.
  const current = total?.monthSales || 0;
  const target = total?.monthTarget || 0;
  const progress = total?.monthProgress || 0;
  const estimate = progress > 0 ? current / (progress / 100) : current;
  return { estimate, rate: target ? estimate / target * 100 : 0 };
}

export default function WeeklyPage() {
  const weekly: any = data.weekly;
  const total = weekly.total || {};
  const stores = weekly.stores || [];
  const products = weekly.products || [];
  const fc = forecast(total);

  const attention = [...stores]
    .map((s: any) => ({ ...s, score: Math.abs(s.weekChangeRate || 0) + Math.max(0, 80 - (s.monthProgress || 0)) }))
    .sort((a: any,b: any) => b.score - a.score)
    .slice(0, 8);

  const topStores = [...stores].sort((a: any,b: any) => (b.weeklySales || 0) - (a.weeklySales || 0)).slice(0,10);
  const maxStore = Math.max(...topStores.map((s:any)=>s.weeklySales || 0), 1);
  const maxProduct = Math.max(...products.map((p:any)=>p.netSalesQty || p.salesQty || 0), 1);

  const review = [
    `금주 오프라인 매출은 ${won(total.weeklySales || 0)}이며, 주간 목표 대비 ${pct(total.weeklyRate || 0)} 수준입니다.`,
    `전주 매출 ${won(total.prevWeekSales || 0)} 대비 ${signPct(total.weekChangeRate || 0)}로 변동했습니다.`,
    attention[0] ? `${attention[0].store}은 전주 대비 변동폭과 월 누적 진척 기준에서 우선 점검이 필요합니다.` : "관리 필요 매장 데이터가 충분하지 않습니다.",
  ];

  const suggestions = [
    "전주 대비 하락폭이 큰 매장은 유입·진열·주력상품 판매 상태를 우선 점검하세요.",
    "월 누적 진척률이 낮은 매장은 남은 기간 목표 대비 필요 매출을 기준으로 액션을 잡으세요.",
    "상승 매장의 판매 상품과 코디 구성을 다른 매장에도 공유해 회복 포인트로 활용하세요.",
  ];

  return <main><div className="container">
    <Header active="weekly" desc="주간 페이지 · 리더회의판 기반 / 금주 vs 전주 / Mark1" />

    <section className="grid4">
      <Kpi title="주간 목표" value={won(total.weeklyTarget || 0)} />
      <Kpi title="금주 매출" value={won(total.weeklySales || 0)} />
      <Kpi title="주간 달성률" value={pct(total.weeklyRate || 0)} />
      <Kpi title="월 누적 진척률" value={pct(total.monthProgress || 0)} sub={`월 누적 ${won(total.monthSales || 0)}`} />
    </section>

    <section className="grid2">
      <Card title="주간 매장 매출 TOP10">
        <div className="bar-list">
          {topStores.map((s:any) => <div className="bar-line" key={s.store}>
            <b>{s.store}</b>
            <div className="bar-track"><div className="bar-fill" style={{width: `${Math.max(3, (s.weeklySales || 0) / maxStore * 100)}%`}} /></div>
            <b>{won(s.weeklySales || 0)}</b>
          </div>)}
        </div>
      </Card>
      <Card title="매장별 전주 vs 금주 비교">
        <div className="bar-list">
          {topStores.map((s:any) => {
            const max = Math.max(s.prevWeekSales || 0, s.weeklySales || 0, 1);
            return <div key={s.store} className="bar-line">
              <b>{s.store}</b>
              <div className="dual-bar">
                <div className="dual"><span className="prev" style={{width:`${(s.prevWeekSales || 0)/max*100}%`}} /></div>
                <div className="dual"><span className="curr" style={{width:`${(s.weeklySales || 0)/max*100}%`}} /></div>
              </div>
              <b className={tone(s.weekChangeRate || 0)}>{signPct(s.weekChangeRate || 0)}</b>
            </div>
          })}
        </div>
      </Card>
    </section>

    <section className="grid2">
      <Card title="매출관리 필요매장(주간)">
        {attention.map((s:any, i:number) => <div className="row-card" key={s.store}>
          <div className="row-head">
            <div><div className="rank">#{i+1}</div><div className="name">{s.store}</div></div>
            <div><div className={`big ${tone(s.weekChangeRate || 0)}`}>{signPct(s.weekChangeRate || 0)}</div><div className="subtitle">전주 대비</div></div>
          </div>
          <div className="mini-grid">
            <Mini label="전주 매출" value={won(s.prevWeekSales || 0)} />
            <Mini label="금주 매출" value={won(s.weeklySales || 0)} bold />
            <Mini label="월 진척률" value={pct(s.monthProgress || 0)} />
          </div>
        </div>)}
      </Card>

      <Card title="상품 TOP10">
        {products.map((p:any, i:number) => <div className="row-card" key={p.styleCode}>
          <div className="row-head">
            <div><div className="rank">#{i+1} · {p.styleCode}</div><div className="name">{p.productName}</div><div className="subtitle">{p.category}</div></div>
            <div><div className="big">{comma(p.netSalesQty || p.salesQty || 0)}개</div><div className="subtitle">판매수량</div></div>
          </div>
          <div className="mini-grid four">
            <Mini label="출고" value={`${comma(p.shipQty || 0)}개`} />
            <Mini label="재고" value={`${comma(p.stockQty || 0)}개`} />
            <Mini label="판매금액" value={won(p.salesAmount || 0)} />
            <Mini label="판매율" value={pct((p.shipQty || 0) ? (p.netSalesQty || 0)/(p.shipQty || 1)*100 : 0)} />
          </div>
          <div className="bar-track" style={{marginTop: 12}}><div className="bar-fill" style={{width:`${Math.max(2, (p.netSalesQty || p.salesQty || 0)/maxProduct*100)}%`}} /></div>
        </div>)}
      </Card>
    </section>

    <section className="grid2">
      <Card title="주간 매출 리뷰"><ul className="review-list">{review.map(t => <li key={t}>{t}</li>)}</ul></Card>
      <Card title="운영 제안"><ul className="review-list">{suggestions.map(t => <li key={t}>{t}</li>)}</ul></Card>
    </section>
  </div></main>;
}
