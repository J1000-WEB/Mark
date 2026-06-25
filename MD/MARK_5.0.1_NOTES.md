# MARK 5.0.1 History Dashboard Patch

## 핵심 수정
- 일간/주간/월간 매출대시보드를 Daily_Sales_History 누적 데이터 기준으로 집계
- ERP 원본 직접 조회는 재고CTRL/재고현황/스냅샷 생성 보조용으로 최소화
- 주간 기준: Daily_Sales_History 최신일자가 포함된 월~일
- 주간 비교: 직전 주 월~일
- 일간 기준: Daily_Sales_History 최신일자
- 일간 비교: 최신일자 -7일
- 월간 기준: 최신일자 기준 월초~최신일자
- 월간 비교: 전월 전체
- 주간 TOP상품/점포별 TOP상품도 Daily_Sales_History 기준으로 집계

## 유지
- 재고CTRL은 현재 재고/RT 제안 때문에 기존 ERP 상품/재고 데이터 보조 조회 유지
- RT/프로모션 성과분석은 Daily_Sales_History 기반 유지
