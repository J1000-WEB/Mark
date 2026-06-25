# MARK 4.91.5 Performance Logic Fix

## 프로모션
- 종료일이 있어도 성과분석은 시작일 포함 3일만 계산
- 실행 후: 시작일~시작일+2일
- 실행 전: 시작일-7일~시작일-5일
- 실행 전/후 기간 겹침 방지
- 핵심 오프라인 매장만 집계 유지

## RT
- RT_Result H열 지시일 기준 유지
- 실행전주 vs 실행주 유지
- Daily_Sales_History에서 상품명 보강
- RT_Result 품번의 상품명 누락 보완
