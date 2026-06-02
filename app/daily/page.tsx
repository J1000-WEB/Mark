import data from "@/data/mark1.json";
import { Card, Header, Kpi, Mini, pct, signPct, tone, won, comma } from "@/components/ui";

export default function DailyPage() {
  const daily: any = data.daily;
  const total = daily.total || {};
  const stores = daily.stores || [];
  const topStores = [...stores].sort((a:any,b:any)=>(b.sales||0)-(a.sales||0)).slice(0,10);
  const attention = [...stores].sort((a:any,b:any)=>Math.abs(b.sameDayChangeRate||0)-Math.abs(a.sameDayChangeRate||0)).slice(0,8);
  const maxSales = Math.max(...topStores.map((s:any)=>s.sales||0), 1);

  return <main><div className="container">
    <Header active="daily" desc="일간 페이지 · 금일 vs 전주 동요일 비교 / Mark1" />
    <section className="grid4">
      <Kpi title="금일 매출" value={won(total.sales || 0)} />
      <Kpi title="전주 동요일" value={won(total.prevWeekSameDay || 0)} />
      <Kpi title="전주 동요일 대비" value={signPct(total.sameDayChangeRate || 0)} />
      <Kpi title="수량 / 건수" value={`${comma(total.qty || 0)}개`} sub={`${comma(total.transactions || 0)}건`} />
    </section>
    <section className="grid2">
      <Card title="일간 매장 매출 TOP10">
        <div className="bar-list">{topStores.map((s:any) => <div className="bar-line" key={s.store}>
          <b>{s.store}</b><div className="bar-track"><div className="bar-fill" style={{width:`${Math.max(3,(s.sales||0)/maxSales*100)}%`}} /></div><b>{won(s.sales||0)}</b>
        </div>)}</div>
      </Card>
      <Card title="전주 동요일 대비 변동 매장">
        {attention.map((s:any,i:number)=><div className="row-card" key={s.store}>
          <div className="row-head"><div><div className="rank">#{i+1}</div><div className="name">{s.store}</div></div><div className={`big ${tone(s.sameDayChangeRate||0)}`}>{signPct(s.sameDayChangeRate||0)}</div></div>
          <div className="mini-grid"><Mini label="금일" value={won(s.sales||0)} bold /><Mini label="전주 동요일" value={won(s.prevWeekSameDay||0)} /><Mini label="달성률" value={pct(s.rate||0)} /></div>
        </div>)}
      </Card>
    </section>
    <section className="grid2">
      <Card title="일간 매출 리뷰"><ul className="review-list"><li>금일 매출은 {won(total.sales||0)}이며, 전주 동요일 대비 {signPct(total.sameDayChangeRate||0)}입니다.</li><li>전일 비교가 아닌 전주 동요일 기준으로 오프라인 요일 효과를 보정했습니다.</li></ul></Card>
      <Card title="운영 제안"><ul className="review-list"><li>전주 동요일 대비 하락 매장은 상품 진열·객수·구매전환 흐름을 우선 점검하세요.</li><li>상승 매장은 판매 상품과 접객 포인트를 주간 회의에 공유하세요.</li></ul></Card>
    </section>
  </div></main>;
}
