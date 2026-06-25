# Inventory RT + Font + RT_Result Patch

덮어쓰기/추가 경로:
- components/InventoryDashboard.tsx
- app/api/rt-result/route.ts
- app/globals.css

폰트 파일은 직접 아래 경로에 넣어주세요. 폰트 파일은 이 ZIP에 포함하지 않았습니다.
- public/fonts/NotoSansKR-Regular.ttf
- public/fonts/NotoSansKR-Medium.ttf
- public/fonts/NotoSansKR-SemiBold.ttf

RT_Result 구조:
A 보낼채널코드
B 받을채널코드
C 스타일
D 칼라
E 사이즈
F 수량
G 승인날짜


## MARK 4.74
- 금주/전주 신규 구조의 기간판매1/2 매핑 보정
- 기간판매 판매/반품/합계/판매금액 구조에서 합계(+2), 판매금액(+3) 기준으로 TOP20/RT 집계 정상화
- 재고CTRL 화면 버전 표기 MARK 4.74 반영
