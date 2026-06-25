# MARK 4.91.3 RT Result Performance Patch

## 수정
- RT 성과분석에 RT_Result 저장 기록을 직접 반영
- RT_Result의 스타일/칼라/사이즈/수량/승인일 기준으로 RT 실행 품번 표시
- 동일 승인일+출고점+입고점+품번은 합산
- Promotion_Performance에 자동 기록된 RT와 RT_Result를 병합
- RT 선택 시 출고점 → 입고점, RT수량, 소진율, 등급 표시 강화
- 프로모션 성과 로직은 기존 4.91.2 기간 보정 유지

## 데이터 소스
- Promotion_Performance: MARK_DB
- Daily_Sales_History: MARK_HISTORY
- RT_Result: 메인 스프레드시트
