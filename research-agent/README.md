# MARK Research Agent v0.2

## 뭐 하는 건지
MARK(Logic Center)에 등록된 **Research_Request**(대기중인 요청)를, 소천님 PC에서 돌아가는
`watch.js`가 주기적으로 확인해서, **Claude Code CLI**로 처리하고 결과를 다시 MARK에 저장합니다.

- 서버(Vercel)는 Anthropic API를 직접 호출하지 않습니다 — **API 토큰 과금 없음**
- 대신 이 PC가 켜져있고 `watch.js`가 실행 중이어야 자동으로 처리됩니다
- 결과는 사람이 Logic Center에서 검토·승인해야 실제로 반영됩니다 (자동 코드수정 없음)

## 사전 준비
1. Claude Code CLI가 이 PC에 설치되어 있고, 터미널에서 `claude` 명령이 동작해야 합니다.
2. Node.js 18 이상 (내장 fetch 사용)

## 실행 방법

```bash
# 환경변수 설정 (한 번만 하면 터미널 세션 동안 유지됩니다)
set MARK_BASE_URL=https://당신의도메인.vercel.app
set LOGIC_PASSWORD=4885

# 실행
node research-agent/watch.js
```

기본은 5분마다 확인합니다. 주기를 바꾸려면:
```bash
set POLL_INTERVAL_MS=600000
```
(밀리초 단위, 600000 = 10분)

## 항상 켜두려면 (Windows)
- **작업 스케줄러**: "로그온할 때" 트리거로 `node research-agent/watch.js` 실행하도록 등록
- 또는 **pm2** 같은 프로세스 매니저 사용:
  ```bash
  npm install -g pm2
  pm2 start research-agent/watch.js --name mark-research-agent
  pm2 save
  ```

## 흐름 요약
1. Logic Center(`/logic`)에서 "Research_Request 수동 생성"으로 요청을 등록 (또는 Research Agent 화면에서 생성)
2. `watch.js`가 그 요청을 발견하면, MARK의 일반 분석 데이터(Snapshot_Master/Logic_Master/AI인사이트/시트구조)에
   그 요청 내용을 덧붙여서 프롬프트를 만듦
3. `claude -p`로 실행해서 Claude Code의 답변을 받음
4. 답변을 파싱해서 **Logic_Master**에 로직 제안 3~5개를 pending 상태로 저장
5. 원본 요청은 Research_Request에서 processed로 표시되고, 원문 답변은 **Research_Result**에 남음
6. 소천님이 Logic Center에서 pending 제안들을 검토 → 승인/보류/거절
7. **승인해도 코드가 자동으로 바뀌지는 않습니다** — 승인된 항목은 "다음에 Claude와 대화할 때 우선 반영할 작업 목록"으로 씁니다

## 문제 해결
- `claude: command not found` → Claude Code 설치 확인, PATH에 등록되어 있는지 확인
- 매번 "비밀번호가 올바르지 않습니다" → LOGIC_PASSWORD 환경변수가 Vercel의 LOGIC_CENTER_PASSWORD와 일치하는지 확인
- 요청이 계속 안 처리됨 → 터미널에 watch.js 로그가 계속 찍히고 있는지, 대기중인 요청이 실제로 있는지 Logic Center 화면에서 확인
