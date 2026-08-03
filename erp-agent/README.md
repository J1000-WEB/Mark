# MARK ERP Agent (실험 단계 v0.1)

## 뭐 하는 건지
ERP 모바일 화면(https://gim.sgerp.com/indexGI.jsp)에 자동으로 로그인해서, "채널별 매출현황"의
스타일/컬러/사이즈별 판매 데이터를 긁어옵니다. 이 화면엔 다운로드 버튼이 없어서(모바일 전용),
브라우저 자동화(Playwright)로 화면을 직접 읽습니다.

아직 실험 단계예요. 실제 사이트의 HTML 구조를 보지 못한 채로 만들어서, 처음엔 선택자
(로그인 입력창, 메뉴 위치 등)가 안 맞을 가능성이 높습니다. 안 되면 디버그 모드로 다시 실행해서
스크린샷을 Claude에게 보내주시면, 그거 보고 고칩니다.

## 절대 하지 말 것
ERP 아이디/비밀번호를 Claude와의 채팅에 절대 입력하지 마세요. .env 파일에만 넣으세요.

## 사전 준비
```bash
npm install playwright
npx playwright install chromium
```

## 설정
이 폴더(erp-agent)에 .env 파일을 만들고 이렇게 채우세요 (.env.example 참고):
```
ERP_USER=본인아이디
ERP_PASS=본인비밀번호
ERP_BASE_URL=https://gim.sgerp.com/indexGI.jsp
MARK_BASE_URL=https://mark-khaki.vercel.app
```

## 실행
### 한 번만 실행 (테스트용)
```bash
node erp-agent/scrape.js
node erp-agent/parse-and-upload.js
```

### 계속 반복 실행 (실제 운영용)
```bash
node erp-agent/run-loop.js
```
또는 `run-loop.bat` 더블클릭.

기본 10분마다 (scrape.js → parse-and-upload.js) 한 사이클씩 반복합니다. **이 창을 닫지 않고
최소화만 해두면** 계속 갱신돼요 (watch.js랑 같은 패턴이에요).

주기를 바꾸려면(예: 30분마다):
```bash
set ERP_POLL_INTERVAL_MS=1800000
node erp-agent\run-loop.js
```
(밀리초 단위, 1800000 = 30분)

### 항상 켜두려면 (Windows)
- **작업 스케줄러**: "로그온할 때" 트리거로 `node erp-agent\run-loop.js` 실행 등록
- 또는 **pm2**: `pm2 start erp-agent/run-loop.js --name mark-erp-agent`

### 안 될 때 (디버그 모드)
```bash
set DEBUG=1
node erp-agent/scrape.js
```
이러면 브라우저 창이 실제로 보이는 상태로 실행되고, 단계별 스크린샷이 erp-agent/debug/ 폴더에 저장됩니다.
이 스크린샷들을 Claude에게 보내주시면, 정확한 화면 구조를 보고 선택자를 고쳐드릴 수 있어요.

## 지금 저장되는 것
erp-agent/scraped-YYYY-MM-DD.json에 긁어온 표 데이터가 저장됩니다. 아직 MARK로 자동 업로드는
안 붙였어요.

## 다음 단계 (참고)
1. 로그인 + 데이터 화면 진입이 안정적으로 되는지 확인
2. 긁어온 데이터를 MARK가 읽을 수 있는 형식으로 변환
3. 기존 청크 업로드 API 패턴으로 자동 전송하는 단계 추가
4. 매일 자동 실행되도록 스케줄링(Windows 작업 스케줄러)
