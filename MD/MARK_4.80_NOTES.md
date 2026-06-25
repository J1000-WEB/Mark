# MARK 4.80

## 판매전체상 V2
- 달력형에서 운영 로드맵/간트차트형으로 변경
- Schedule_Simple 구조 반영
  - A 시작일
  - B 종료일
  - C 대분류
  - D 구분
  - E 내용
- 가로축 날짜, 세로축 카테고리
- 기간 일정은 막대로 연결 표시
- 휴무 과노출 방지를 위해 기본적으로 휴무 숨김
- 좌우 스크롤 지원

## 자동 Snapshot 운영 방향
- 매일 12:00 Daily_Sales_History 저장
- 매주 월요일 12:10 Weekly Snapshot + RT Performance 저장 예정

## Agent Growth Loop 로드맵
- Logic_Master 실제 반영
- RT Performance 검산
- Logic_Evaluation
- 승인 로직 → 실행 → 성과 → 개선 제안 구조로 확장 예정
