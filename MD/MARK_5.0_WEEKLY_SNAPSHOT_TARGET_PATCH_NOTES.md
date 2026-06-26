# MARK 5.0 Weekly Snapshot & Target Patch

## 주간매출 대시보드 로딩 구조
- 주간매출 페이지는 먼저 `Weekly_Snapshot`을 조회합니다.
- 저장된 주간 스냅샷이 있으면 원본/DB를 다시 읽지 않고 스냅샷 payload로 화면을 구성합니다.
- 저장된 스냅샷이 없을 때만 `/api/data` 실시간 계산으로 fallback합니다.
- `실시간 갱신+스냅샷` 버튼을 누르면 `/api/data`로 재계산 후 `Weekly_Snapshot`에 저장합니다.

## 주차 확인 버튼
- 주간매출 대시보드 상단에 `주차 확인` 버튼 영역을 추가했습니다.
- 저장된 `Weekly_Snapshot` 목록을 `6월22일 주차` 형식으로 표시합니다.
- 버튼 클릭 시 해당 주차 스냅샷으로 화면을 즉시 전환합니다.

## 주간 목표 매핑
- 첨부된 원본 구조 기준으로 주간 목표 시트를 매핑했습니다.
- 대상 시트명 예시: `전주(0607)`, `차주(0621)` 등 괄호 안 MMDD가 있는 주간 목표 시트.
- 매핑 기준:
  - C열: 채널
  - D열: 채널명
  - E열: 일 목표
  - H열: 주간 목표
  - K열: 기준일 목표
  - L열: 월 누적 목표
  - P열: 년 목표
- `일간매출(26년)` 기반 매출 row에 위 목표값을 점포명 기준으로 병합합니다.

## 수정 파일
- `components/MarkDashboard.tsx`
- `lib/dataBuilder.ts`
- `app/api/weekly-snapshots/route.ts`
