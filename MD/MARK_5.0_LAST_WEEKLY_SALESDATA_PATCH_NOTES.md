# MARK 5.0 Last Patch - Weekly Dashboard / Sales Data

## 주간매출 대시보드
- 주간 기준 표시를 `차주/전주` 표현에서 `기준주차 월요일 / 분석기간 / 비교기간`으로 변경
  - 예: 기준주차 6/22 월요일 → 분석기간 6/15~6/21, 비교기간 6/8~6/14
- 주간 화면은 `Weekly_Snapshot`을 우선 조회하도록 변경
- 저장된 스냅샷을 버튼으로 선택하는 `주차 확인` 영역 추가
- `실시간 갱신+스냅샷` 버튼 추가
- `실시간 확인` 버튼은 원본/History를 다시 계산해 확인하는 용도
- `일간매출(26년)`의 기간목표 행을 읽어 주간 목표/달성률에 반영
- `글로벌_`, `기타_` 채널은 오프라인 대시보드 집계에서 제외

## 판매데이터 페이지
- 신규 메뉴: `판매데이터`
- `/sales-data` 페이지 추가
- 주간판매데이터 시트명 패턴을 자동 인식
  - `06.15~06.21(품번)`
  - `06.15~06.21(컬러)`
- 주차 선택 버튼 추가
- `품번/컬러` 탭 전환 추가
- 원본 엑셀과 유사하게 전체 컬럼을 펼쳐서 보여주는 웹 테이블 구성

## 수정/추가 파일
- components/MarkDashboard.tsx
- components/NavTabs.tsx
- components/SalesDataDashboard.tsx
- lib/dataBuilder.ts
- lib/mark.ts
- app/api/weekly-snapshots/route.ts
- app/api/sales-data/route.ts
- app/sales-data/page.tsx
