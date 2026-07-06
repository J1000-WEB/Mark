# MARK 6.4 전용 Weekly History 분리

## 목적
기존 `MARK_HISTORY` 통합 파일의 `Daily_Sales_History`가 대용량으로 누적되면서 Google Sheets 1,000만 셀 제한에 근접했습니다.
주간 상품·점포 이력과 주간 화면 저장본을 별도 스프레드시트로 옮겨 일간 이력과 분리합니다.

## 전용 스프레드시트
- 이름: `MARK_WEEKLY_HISTORY`
- Spreadsheet ID: `19cSF8l67-qHl6s3MhEXwGzDaIFVQVg2WS6EWHLyB57A`
- 환경변수(권장): `GOOGLE_SHEET_ID_WEEKLY_HISTORY`
  - 환경변수가 비어 있어도 현재 배포본은 위 ID를 기본값으로 사용합니다.

## 시트 구조
### `Weekly_history`
A~S 컬럼을 아래 순서로 사용합니다.

1. 기준일
2. 분석시작일
3. 분석종료일
4. 비교시작일
5. 비교종료일
6. 구분
7. 스타일
8. 스타일명
9. 칼라
10. 칼라명
11. 사이즈
12. 점포명
13. 금주판매수량
14. 금주판매금액
15. 전주판매수량
16. 전주판매금액
17. 재고
18. Snapshot일시
19. SnapshotVersion

- 기준일(월요일) 단위로 저장합니다.
- 같은 기준일을 재생성하면 기존 해당 주차 행을 교체합니다.
- 중복 정리 키: `기준일 + 구분 + 스타일 + 칼라 + 사이즈 + 점포명`
- 현재 원본 주간 데이터의 집계 구조상 사이즈는 공란일 수 있으며, 향후 사이즈별 원본 매핑이 추가되면 그대로 수용합니다.

### `Weekly_Snapshot`
- 주간 대시보드의 6/29, 7/6 등 선택용 화면 저장본입니다.
- 같은 기준 월요일은 새 행을 append하지 않고 최신 payload로 교체합니다.
- 기존 `MARK_HISTORY`에 있던 주간 저장본과 분리됩니다.

## 데이터 역할 분리
| 데이터 | 저장 위치 | 용도 |
|---|---|---|
| Daily_Sales_History | 기존 `MARK_HISTORY` | 일간 판매 이력 / RT 일간 성과 |
| Weekly_history | `MARK_WEEKLY_HISTORY` | 판매데이터, 상품·점포 주간 이력 |
| Weekly_Snapshot | `MARK_WEEKLY_HISTORY` | 주간 대시보드 화면 저장본 및 주차 선택 |
| 일간매출(26년) | `MARK_DB` | 주간 대시보드 점포 매출 KPI/순위 실시간 원본 |

## 자동 저장
`/api/auto-weekly-snapshot`은 이제 아래 순서로 실행됩니다.

1. `Weekly_history`를 현재 기준 월요일로 교체 저장
2. `MARK_DB / 일간매출(26년)`으로 주간 대시보드 계산
3. 전용 `Weekly_Snapshot`을 같은 기준일 기준으로 교체 저장

## 남은 과제
이 버전은 주간 이력만 분리합니다. Google Sheets 1,000만 셀 오류의 근본 원인인 대용량 `Daily_Sales_History`는 별도 `MARK_DAILY_HISTORY` 스프레드시트로 이전해야 합니다.
