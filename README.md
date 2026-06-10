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


## Mark3.0.1
- 주간 페이지의 매장별 주간 매출 순위 내부 스크롤 제거
- 순위 리스트가 전체 표시되도록 카드 높이 자동 확장


## Mark3.0.2
- 담당자 메모 저장 후 읽기 카드 형태로 표시
- 수정 버튼 클릭 시에만 입력창 표시
- 취소/수정/삭제 UX 개선


## Mark3.0.3
- 주간 매출관리 필요매장/매장별 매출순위 카드 높이 균형 조정
- 매장별 매출순위 내부 스크롤 적용
- 매출실적 진하게 표시
- 전주비 신장/역신장 색상 표시


## Mark3.1
- 재고CTRL에 프로모션 제안 TOP10 추가
- 금주전주 A열 시즌 / AD열 최초 출고일 기준 반영
- 온오프재고현황 Q/R/S 합산 재고 기준 반영
- 시즌 선택 드롭다운 추가
- 상위 5개 정도 보이고 내부 스크롤로 10개 확인
- 상품별 제안 기준 표시


## Mark3.1.1
- 프로모션 제안 로직 수정
- 전체 TOP10 선별 후 시즌 필터가 아니라, 시즌 선택 후 TOP10 표시
- 2026여름 상품도 후보가 보이도록 후보 풀 확대
- 봄상품은 기본 추천 우선순위에서 일부 후순위 처리


## Mark3.1.2
- 구글시트 실시간 데이터 API에도 프로모션 후보 계산 로직 추가
- 시즌 선택 후 해당 시즌 TOP10이 표시되도록 수정
- 2026여름 후보가 구글시트 실시간 모드에서도 표시되도록 수정


## Mark3.1.3
- 구글시트 상품 시트명 `금주/전주` 인식 추가
- 기존 `금주전주`도 fallback으로 유지
- Google Sheets range parse 오류 수정


## Mark3.2
- 온오프재고현황 L열 TAG가 / M열 현재판매가 반영
- 프로모션 제안에 TAG가 / 현재판매가 / 추천 프로모션가 / 할인율 추가
- 재고CTRL 하단에 품번 입력형 상품 AI 분석 추가
- 상품 분석에서 판매수량, 전주비, 재고주수, 온오프 재고, 가격조정 제안 표시


## Mark4 Alpha
- AI 인사이트 메뉴 추가
- Anthropic Claude API 연동
- GENERAL IDEA 오프라인 영업 MD 역할 프롬프트 적용
- 이번주 AI 인사이트 생성 버튼 추가
- 구글시트/Mark 계산 결과 요약 후 Claude 분석
- AI인사이트 시트 저장 시도
- 필요 환경변수: ANTHROPIC_API_KEY


## Mark4 Alpha.1
- 구글시트 시트명 자동보정 강화
- `금주/전주`, `금주전주`, `금주_전주`, `금주 전주` 모두 인식
- `온오프재고현황`, `온/오프재고현황` 계열 모두 인식
- Mark4 AI 인사이트 기능 유지


## Mark4 Alpha.2
- app/layout.tsx 구조 복구
- app/globals.css에 Tailwind CSS 분리
- root layout.tsx 오배치 방지


## Mark4 Alpha.3
- 루트 layout.tsx / route.ts 오배치 파일 제거
- app/inventory/page.tsx 구조 복구
- app/insights/page.tsx 구조 확인
- route.ts에 JSX가 들어가는 오류 방지
