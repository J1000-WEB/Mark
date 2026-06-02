import data from "./mark-data.json";
export const markData=data as any;
export const isShop=(s:string)=>String(s||"").startsWith("오프라인_");
export const won=(v:number)=>`${Math.round(v||0).toLocaleString("ko-KR")}원`;
export const num=(v:number)=>Math.round(v||0).toLocaleString("ko-KR");
export const pct=(v:number)=>!Number.isFinite(v)?"0.0%":`${v.toFixed(1)}%`;
export const rate=(c:number,p:number)=>!p?(c?100:0):(c-p)/p*100;
export function merge(cur:any[],cmp:any[],yr:any[]=[]){const cm=new Map(cmp.map((r:any)=>[r.storeName,r]));const ym=new Map(yr.map((r:any)=>[r.storeName,r]));return cur.map((r:any)=>{const p:any=cm.get(r.storeName)||{};const y:any=ym.get(r.storeName)||{};return {...r,compareDaySales:p.daySales||0,compareWeekSales:p.weekSales||0,compareMonthSales:p.monthSales||0,prevYearMonthSales:y.monthSales||0,dayChangeRate:rate(r.daySales||0,p.daySales||0),weekChangeRate:rate(r.weekSales||0,p.weekSales||0),monthChangeRate:rate(r.monthSales||0,p.monthSales||0),yearMonthChangeRate:rate(r.monthSales||0,y.monthSales||0)}})}
export function split(rows:any[]){return {core:rows.filter(r=>!isShop(r.storeName)),shop:rows.filter(r=>isShop(r.storeName))}}
export function totals(rows:any[]){const sum=(f:string)=>rows.reduce((s,r)=>s+Number(r[f]||0),0);const dayTarget=sum("dayTarget"),daySales=sum("daySales"),weekTarget=sum("weekTarget"),weekSales=sum("weekSales"),monthTarget=sum("monthTarget"),monthSales=sum("monthSales");const cday=sum("compareDaySales"),cweek=sum("compareWeekSales"),cmonth=sum("compareMonthSales"),ymonth=sum("prevYearMonthSales");return{dayTarget,daySales,dayRate:dayTarget?daySales/dayTarget*100:0,dayChange:rate(daySales,cday),weekTarget,weekSales,weekRate:weekTarget?weekSales/weekTarget*100:0,weekChange:rate(weekSales,cweek),monthTarget,monthSales,monthRate:monthTarget?monthSales/monthTarget*100:0,monthChange:rate(monthSales,cmonth),yearMonthChange:rate(monthSales,ymonth)}}
export const rank=(rows:any[],f:string)=>[...rows].filter(r=>Number(r[f]||0)>0).sort((a,b)=>Number(b[f]||0)-Number(a[f]||0));
export const good=(rows:any[])=>[...rows].filter(r=>r.weekSales>0).sort((a,b)=>b.weekChangeRate-a.weekChangeRate).slice(0,3);
export const bad=(rows:any[])=>[...rows].filter(r=>r.weekSales>0).sort((a,b)=>a.weekChangeRate-b.weekChangeRate).slice(0,3);
export const shopSummary=(rows:any[])=>[...rows].map(r=>({...r,inventoryNote:(r.weekRate||0)>=90?"재고 추가 투입 검토":(r.weekRate||0)<60?"재고 순환/상품 교체 검토":"정상 운영"})).sort((a,b)=>b.weekSales-a.weekSales);
