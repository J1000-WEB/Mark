# MARK 4.91.1 Performance History Fix

## 수정
- Promotion_Performance는 MARK_DB에서 읽음
- Daily_Sales_History는 MARK_HISTORY에서 읽음
- 기존에는 Daily_Sales_History를 MARK_DB에서 찾을 수 있어 성과가 0으로 표시될 수 있었음
- Daily_Sales_History가 MARK_DB에 있는 예외 상황도 fallback 지원

## 확인
- RT/프로모션 성과 확인에서 추가판매/추가매출이 Daily_Sales_History 기준으로 계산되어야 함
