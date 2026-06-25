# MARK 5.0.2 Priority 1~3 Patch

## 이번 패치에서 반영
- 매출대시보드 상단에 데이터 새로고침 버튼 추가
  - 클릭 시 /api/snapshots POST 후 /api/data 재조회
  - Daily_Sales_History 기준 데이터 상태 표시
- 판매전체상 기본 기준을 오늘 날짜가 포함된 월로 고정
- 판매전체상 분류 단순화
  - 프로모션 / VMD / 회의 / 인원별 일정 / 기타 일정
  - 휴무/출장/교육은 인원별 일정에 표시
- 주간 AI 브리핑에 RT/프로모션 성과 요약 추가
- 5.0.1의 Daily_Sales_History 기반 일간/주간/월간 집계 유지

## 아직 남은 것
- 웹 접속 시 Snapshot_Master 최신본만 읽는 완전 캐시 구조
- Snapshot_Master에 대시보드 전체 표시용 JSON을 안전하게 분할 저장하는 구조
- AI 브리핑 V2 전체 고도화
- 상품동향 AI 요약 강화
