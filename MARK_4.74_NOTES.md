# MARK 4.74 변경 요약

- RT 카드 Compact UI 적용
- RT 저장 버튼 제거: 승인 시 RT_Result 자동 저장
- 성수/신사 플래그십 등 점포명 표준화 및 채널코드 매칭 보강
- RT_Result 저장 시 출고점 칼라/사이즈 재고 조회도 표준화 점포명으로 매칭
- Agent 제안 반영: 판매 급락 감점, 신상품 4주 가중치, 전사 TOP30 우수매장 결품 A등급, 우수매장 출고 보호
- RT Smart Transfer Engine V2 표기


## 4.74.2 RT Excel Download
- 재고CTRL RT 이동 제안 상단에 RT 지시서 다운로드 버튼 추가
- RT_Result 저장 데이터를 Excel 호환 .xls로 다운로드
- 다운로드 엑셀 헤더 고정: 보낼채널코드 / 받을채널코드 / 스타일 / 칼라 / 사이즈 / 지시수량 / 승인날짜
- 다운로드 시 RT_Result H열 다운로드날짜 기록
