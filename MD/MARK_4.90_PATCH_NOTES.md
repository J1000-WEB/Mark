# MARK 4.90 CORE PATCH

## 핵심 변경
- 일간/주간/월간 매출대시보드: 온라인 채널 제외, 오프라인 매장 기준 분석
- Daily_Sales_History: 수동/자동 저장 로직 통합 유지
- 재고CTRL: RT / 온라인 이관 / 프로모션 역할 분리
- 온라인 이관 제안: 온라인 가용재고를 오프라인 판매 가능 채널로 이관 추천
- 프로모션 로직: 오프라인 운영재고 기준 유지
- Snapshot_Master: 같은 주차/월 키는 중복 append 대신 update
- auto-weekly-snapshot route 추가

## Daily_Sales_History 헤더
일자	점포	스타일	스타일명	칼라	칼라명	사이즈	판매수량	판매금액	재고
