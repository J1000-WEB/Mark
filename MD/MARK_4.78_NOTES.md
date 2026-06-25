# MARK 4.78 Daily Engine

- 관리자 메뉴 정리
  - 상단 NavTabs에서 Snapshot/Logic Center 제거
  - 하단 ADMIN ONLY 영역에 Snapshot / Logic Center 배치

- Daily Engine 추가
  - MARK_DB의 `스타일별 채널별 입고판매재고현황` 시트 읽기
  - 헤더 탐색 방식으로 채널별 일간/주간/누적/재고 파싱
  - 고정 열번호 의존 최소화

- 일간 대시보드 개편
  - 일별 판매 TOP 상품
  - 일별 판매 채널 TOP
  - 일간 결품위험
  - Daily History 저장 버튼

- MARK_HISTORY 연동
  - Daily_Sales_History 시트 자동 생성/저장
  - Snapshot 저장 시 Daily_Sales_History도 함께 저장

필수 환경변수:
- GOOGLE_SHEET_ID_DB
- GOOGLE_SHEET_ID_HISTORY
