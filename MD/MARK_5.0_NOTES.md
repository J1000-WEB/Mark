# MARK 5.0 Performance Center Patch

## 핵심
- RT / 프로모션 성과분석에 사용자 지정 기간 분석 추가
- RT 기본값: RT_Result H열 지시일 기준 실행전주 7일 ↔ 실행주 7일
- 프로모션 기본값: 시작일 기준 전주 동일요일 3일 ↔ 실행 3일
- 사용자 지정: 비교기간 시작/종료 + 실행기간 시작/종료 직접 선택
- `/api/performance` 신규 추가
- Daily_Sales_History 최신 누적 데이터 기준으로 재계산

## 데이터 소스
- RT: RT_Result + Daily_Sales_History + 객_전주 점포코드 매핑
- 프로모션: Promotion_Performance + Daily_Sales_History
- 프로모션은 핵심 오프라인 매장만 집계
