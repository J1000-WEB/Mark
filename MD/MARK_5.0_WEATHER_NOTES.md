# MARK 5.0 Weather Seoul Patch

## 추가
- `lib/openWeather.ts`
  - OpenWeather API Key 한 줄 입력 방식
  - 서울 기준 5일/3시간 예보 수집
  - 날짜별 최고기온/최저기온/날씨/강수확률/강수량/습도/풍속 집계
  - `Weather_History` 시트 저장
- `app/api/weather/route.ts`
  - 판매전체상 화면에서 날씨 기록 조회
  - `?refresh=1`로 수동 수집 테스트 가능
- `app/api/auto-weather/route.ts`
  - 매일 00시 자동 실행용 엔드포인트

## 화면 반영
- 판매전체상 하단에 `서울 날씨` 행 추가
- 기본 표시: 최고기온 / 최저기온 / 날씨
- 마우스 오버 tooltip: 구분, 날씨, 최고/최저, 강수확률, 강수량, 습도, 풍속, 저장시간

## API Key 입력 위치
- `lib/openWeather.ts`
- `OPENWEATHER_API_KEY` 상수에 키 붙여넣기
