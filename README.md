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

## MARK 5.0 Weather_History 연동

- 시트명: `Weather_History`
- 지역: 서울 단일 운영
- 수동 테스트: `/api/weather`에 POST 요청
- 자동 실행: Vercel Cron `/api/auto-weather`, UTC 15:00 = 한국시간 00:00
- 필요한 환경변수: `OPENWEATHER_API_KEY`
- 선택 환경변수: `GOOGLE_SHEET_ID_WEATHER` 또는 `GOOGLE_WEATHER_SHEET_ID`를 넣으면 날씨 저장 스프레드시트를 별도 지정합니다. 없으면 `GOOGLE_SHEET_ID`에 저장합니다.

OpenWeather 무료 5일/3시간 예보 API는 과거 실제 날씨를 직접 주지 않으므로, 전일 기록은 전날까지 저장되어 있던 최신 예보값을 `actual`로 확정 저장합니다. 유료 History API를 붙이면 source를 `openweather_history`로 바꿔 실제 관측값 저장 구조로 확장할 수 있습니다.
