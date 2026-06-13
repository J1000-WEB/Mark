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


## Mark4 Alpha.4
- 차주 시트 주실적 실적칸이 비어 있을 때 월판매 실적을 주간 매출로 fallback
- 주간 매출 0원 표시 오류 수정
- 매장별 주간 매출 순위 복구


## Mark4.2
- 주간 전사 TOP 상품 TOP20 스크롤 표시
- 점포별 TOP 상품도 TOP20 스크롤 표시
- 매출관리 필요매장 / 매장별 주간 매출순위 높이 통일
- 프로모션 제안 카드 압축형 UI 적용
- 프로모션 제안에 TAG/현재/추천가격/할인율 간결 표시
- 시즌 필터 후보 목록 및 정규화 개선


## Mark4.3.1
- 재고CTRL UI 압축
- RT 제안 / 물류 추가할당 높이 통일 및 스크롤 적용
- 품절위험 / 과재고 상품 TOP10 5개 노출 + 스크롤
- Snapshot Center 실제 엔진 1차 구현
- Snapshot_Master 시트 자동 생성
- 현재 스냅샷 수동 저장 버튼 구현
- 최근 스냅샷 이력 조회 구현
- 자동 저장은 OFF 상태 유지


## Mark4.3.2
- Snapshot 저장 시 구글시트 셀 50,000자 제한 대응
- Data_JSON을 AI 분석용 핵심 데이터로 압축 저장
- TOP 리스트는 핵심 필드만 저장


## Mark4.3.3
- package.json JSON 파싱 오류 복구
- Mark4.3.2 Snapshot 압축 저장 기능 유지


## Mark4.4
- Snapshot 저장 시 Google Drive JSON 업로드 추가
- GOOGLE_DRIVE_FOLDER_ID 환경변수 사용
- Snapshot_Master Drive_URL 컬럼에 업로드 링크 저장
- Snapshot History에서 Drive 열기 링크 표시
- Drive 업로드 실패 시에도 시트 저장은 계속 진행


## Mark4.5
- Logic Center 추가
- 주간 대시보드 하단 Logic Center 버튼 추가
- Logic_Master 시트 자동 생성
- Claude Chat/Claude Code 제안 붙여넣기 등록
- 승인/보류/거절 상태 관리
- LOGIC_CENTER_PASSWORD 환경변수 지원, 기본값 4885
- Drive 업로드 파일 공개(anyone reader) 권한 부여 제거


## Mark4.6
- Claude Research Agent V1 추가
- Snapshot_Master / Logic_Master / AI인사이트 / 현재 시트 구조를 묶은 Research Input Pack 생성
- Claude Code/Claude Chat에 붙여넣을 수 있는 연구 프롬프트 생성
- 주간 하단 관리자 메뉴에 Logic Center / Research Agent 버튼 배치
- Logic Center는 여전히 수동 승인/보류/거절 구조 유지


## Mark4.7.2
- 상단 Research 메뉴 제거
- Research Agent를 Logic Center 내부로 이동
- 주간 맨 하단에는 Logic Center 버튼만 표시
- Claude Code/Chat 연구 결과를 붙여넣으면 [로직 제안] 블록 자동 분리
- 분리된 제안을 Logic_Master에 pending 상태로 저장
