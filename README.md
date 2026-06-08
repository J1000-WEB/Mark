# 오프라인 매출 리뷰 대시보드 Mark3.0

## 추가 반영
- Google Sheet 실시간 읽기 `/api/data`
- 점포별 메모 저장/수정/삭제 `/api/memos`
- 메모 저장 시트: `소장군`
  - A열: 점포명
  - B열: 메모
  - C열: 수정일시
- 주간 매출관리 필요매장 클릭 상세 패널
  - AI 한줄 리뷰
  - 담당자 메모
  - 호조상품 TOP2
  - 부진상품 TOP2
- 기존 비밀번호 로그인 유지: 0128
- 기본 페이지: `/weekly`

## Vercel 환경변수
- GOOGLE_CLIENT_EMAIL
- GOOGLE_PRIVATE_KEY
- GOOGLE_SHEET_ID
- DASHBOARD_PASSWORD

## 참고
Google Sheet 연동 실패 시 내장 데이터로 자동 fallback 됩니다.
