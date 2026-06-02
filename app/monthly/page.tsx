import data from "@/data/mark1.json";
import { Card, Header, Kpi, Mini, pct, signPct, tone, won } from "@/components/ui";

export default function MonthlyPage() {
  const monthly: any = data.monthly;
  const total = monthly.total || {};
  const stores = monthly.stores || [];
  const topStores = [...stores].sort((a:any,b:any)=>(b.monthSales||0)-(a.monthSales||0)).slice(0,10);
  const riskStores = [...stores].sort((a:any,b:any)=>(a.monthProgress||0)-(b.monthProgress||0)).slice(0,8);
  const maxSales = Math.max(...topStores.map((s:any)=>s.monthSales||0), 1);

  return <main><div className="container">
    <Header active="monthly" desc="월간 페이지 · 당월 vs 전월 vs 전년동월 / Mark1" />
    <section className="grid4">
      <Kpi title="월 목표" value={won(total.target || 0)} />
      <Kpi title="월 누적 매출" value={won(total.sales || 0)} />
      <Kpi title="월 진척률" value={pct(total.progress || 0)} />
      <Kpi title="전월 / 전년 대비" value={signPct(total.momRate || 0)} sub={`전년 ${signPct(total.yoyRate || 0)}`} />
    </section>
    <section className="grid2">
      <Card title="월간 매장 매출 TOP10">
        <div className="bar-list">{topStores.map((s:any)=><div className="bar-line" key={s.store}>
          <b>{s.store}</b><div className="bar-track"><div className="bar-fill" style={{width:`${Math.max(3,(s.monthSales||0)/maxSales*100)}%`}} /></div><b>{won(s.monthSales||0)}</b>
        </div>)}</div>
      </Card>
      <Card title="월간 관리 필요 매장">
        {riskStores.map((s:any,i:number)=><div className="row-card" key={s.store}>
          <div className="row-head"><div><div className="rank">#{i+1}</div><div className="name">{s.store}</div></div><div className={`big ${(s.monthProgress||0)<50 ? "red" : "amber"}`}>{pct(s.monthProgress||0)}</div></div>
          <div className="mini-grid"><Mini label="월 누적" value={won(s.monthSales||0)} bold /><Mini label="월 목표" value={won(s.monthTarget||0)} /><Mini label="전월 실적" value={won(s.prevMonthSales||0)} /></div>
        </div>)}
      </Card>
    </section>
    <section className="grid2">
      <Card title="월간 매출 리뷰"><ul className="review-list"><li>월 누적 매출은 {won(total.sales||0)}이며, 월 목표 대비 {pct(total.progress||0)} 수준입니다.</li><li>전월 실적 대비 {signPct(total.momRate||0)}, 전년동월 대비 {signPct(total.yoyRate||0)}입니다.</li></ul></Card>
      <Card title="운영 제안"><ul className="review-list"><li>월 진척률이 낮은 매장은 남은 기간 필요 매출 기준으로 운영 액션을 잡으세요.</li><li>전월 대비 하락폭이 큰 매장은 상품 구성과 재고 보강 여부를 점검하세요.</li></ul></Card>
    </section>
  </div></main>;
}
