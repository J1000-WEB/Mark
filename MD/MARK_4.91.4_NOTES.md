# MARK 4.91.4 RT / Promotion Scope Fix

## RT
- RT_Result H열을 저장한 날짜 = 지시일로 사용
- H열이 비어있을 때만 기존 승인/제안일 컬럼 fallback
- RT 비교기간은 H열 지시일 기준 실행전주 vs 실행주
- RT_Result 기준 품번/출고점/입고점/RT수량 표시 유지

## 프로모션
- 프로모션 성과는 핵심 오프라인 매장만 집계
- 온라인 채널 제외
- 위탁 채널 제외
- 비교기간 표시 강화

## 공통
- dateRange 날짜 계산을 로컬 YYYY-MM-DD 기준으로 보정
