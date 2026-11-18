# Vercel로 공유하기 (vercel 브랜치, Windows PC 기준)

이 문서와 Vercel용 코드는 **`vercel` 브랜치**에만 있습니다. `main` 브랜치는 실습실 Rocky Linux VM용([deploy.md](deploy.md), [lab-deploy-checklist.md](lab-deploy-checklist.md))이고, Vercel은 링크로 보여 주기 위한 공유용입니다.

## main(VM)과 다른 점

| | main: Rocky VM / 로컬 | vercel 브랜치: Vercel |
|---|---|---|
| 화면(public/) | Apache / Express | Vercel이 정적 파일로 서비스 |
| API(/api)와 실시간(/socket.io) | Node 서버 하나 | Vercel 함수 `api/index.js`가 같은 Express + Socket.IO 서버를 실행 |
| 실시간 전송 | WebSocket, 안 되면 폴링 | **WebSocket만** (Vercel 함수가 지원) |
| 서버 여러 대일 때 | 해당 없음 | Redis(Upstash)로 서로 메시지 전달 |
| DB | 같은 PC/VM의 MySQL | 클라우드 MySQL 호환 DB (TiDB Cloud 무료) |

- 실시간 연결은 Vercel 함수 최대 실행 시간(300초)이 되면 끊기고, 화면이 자동으로 다시 연결해서 빠진 채팅을 채웁니다.
- 처음 접속하거나 한동안 안 쓰다 접속하면 1~3초 느릴 수 있습니다.
- 데이터는 로컬, VM과 공유되지 않는 별도 DB에 저장됩니다.

준비물: GitHub 계정(저장소 `dongpal0825/aquabit`), 이 PC의 Node.js, 프로젝트 폴더.

---

## 1. 클라우드 DB 만들기 (TiDB Cloud, 무료)

1. https://tidbcloud.com 에 가입 (GitHub나 Google 계정)
2. **Create Cluster** → **Starter**(무료), 지역 **Tokyo (ap-northeast-1)** → 만들기
3. 클러스터의 **Connect** 버튼
   - **Generate Password** → 비밀번호 바로 메모 (다시 안 보여 줌)
   - `HOST`, `PORT`(4000), `USERNAME`(`xxxx.root` 모양) 메모
4. 왼쪽 **SQL Editor**에서:

```sql
CREATE DATABASE aquabit;
```

## 2. 테이블과 테스트 데이터 넣기 (이 PC에서)

새 PowerShell 창에서 (따옴표 안을 1번 값으로 바꿔서):

```powershell
cd C:\Users\<사용자>\Documents\202208053\aquabit\server
$env:DB_HOST="gateway01.ap-northeast-1.prod.aws.tidbcloud.com"
$env:DB_PORT="4000"
$env:DB_USER="xxxx.root"
$env:DB_PASSWORD="1번에서-만든-비밀번호"
$env:DB_NAME="aquabit"
$env:DB_SSL="true"
$env:ADMIN_PASSWORD="Vercel용-관리자-비밀번호"
npm run db:init
npm run seed
```

- `스키마를 만들었어요: aquabit`과 seed 완료 메시지가 나오면 성공
- `$env:` 값은 이 창에서만 유효하고 `server\.env`(로컬 DB 설정)는 바뀌지 않습니다. 끝나면 창을 닫으세요.
- `ER_ACCESS_DENIED_ERROR`: 사용자 이름(`xxxx.root` 전체)이나 비밀번호 확인
- `ER_BAD_DB_ERROR`: 1번 4단계의 `CREATE DATABASE aquabit;`를 안 함
- `insecure transport are prohibited`: `$env:DB_SSL="true"` 빠짐

## 3. 세션 키 만들기

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

나온 64자리를 메모합니다.

## 4. Vercel 프로젝트 만들기

1. https://vercel.com → **Sign Up** → **Continue with GitHub** (Hobby)
2. **Add New...** → **Project** → `dongpal0825/aquabit` 옆 **Import**
3. 설정 화면
   - Framework Preset: **Other**
   - Root Directory: `./` 그대로
   - Build and Output Settings: 건드리지 않음 (`vercel.json`이 정함)
4. **Environment Variables**:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | 3번의 64자리 |
| `SERVE_STATIC` | `false` |
| `DB_HOST` | 1번 HOST |
| `DB_PORT` | `4000` |
| `DB_USER` | 1번 USERNAME (`xxxx.root`) |
| `DB_PASSWORD` | 1번 비밀번호 |
| `DB_NAME` | `aquabit` |
| `DB_SSL` | `true` |
| `TIME_SCALE` | `1` |
| `ADMIN_ENABLED` | `true` |

5. **Deploy**. 이 첫 배포는 `main`(VM용 코드)으로 만들어지므로 실시간과 API가 제대로 안 될 수 있습니다. 바로 5번에서 브랜치를 바꿉니다.

## 5. vercel 브랜치로 배포하게 바꾸기

1. 프로젝트 → **Settings** → **Environments** → **Production** → **Branch Tracking**의 브랜치를 `main`에서 **`vercel`**로 바꾸고 저장
   (메뉴 이름이 다르면 Settings의 **Git** 쪽에서 "Production Branch"를 찾으세요)
2. **Deployments** 탭 → 오른쪽 위 **⋯** 또는 **Create Deployment** → 브랜치 `vercel` 선택 → 배포
   (또는 이 PC에서 `vercel` 브랜치에 아무 커밋이나 push하면 자동 배포)
3. 배포 목록에서 Branch가 `vercel`이고 **Production**으로 표시되면 완료

`main`에 push할 때 Vercel이 미리보기(Preview) 배포를 만들 수 있는데, 공유 주소(Production)에는 영향이 없습니다. 불필요하면 Settings → Git → **Ignored Build Step**에 아래를 넣으면 `vercel` 브랜치만 빌드합니다:

```bash
[ "$VERCEL_GIT_COMMIT_REF" != "vercel" ]
```

## 6. Redis 연결하기 (무료, 실시간 안정용)

Vercel은 접속이 늘면 함수 인스턴스를 여러 개 띄웁니다. 철수가 1번, 영희가 2번 인스턴스에 붙으면 Redis 없이는 서로의 실시간 알림이 안 갈 수 있습니다.

1. 프로젝트 → **Storage** 탭 (또는 **Marketplace**) → **Upstash** → **Upstash for Redis** → **Create** / **Install**
2. 무료(Free) 요금제, 지역은 Tokyo처럼 가까운 곳 → 이 프로젝트에 연결(Connect)
3. 환경 변수에 `KV_URL`, `REDIS_URL` 같은 값이 자동으로 추가됐는지 Settings → Environment Variables에서 확인
4. **Deployments** → 최신 배포 **⋯** → **Redeploy** (환경 변수는 다시 배포해야 적용됨)

앱은 `REDIS_URL`이나 `KV_URL`이 있으면 자동으로 Redis를 씁니다. 없으면 인스턴스 하나 안에서만 전달합니다 (접속자가 적으면 대부분 문제없음).

## 7. 확인

1. `https://<주소>/api/health` → `{"ok":true,"timeScale":1}`
2. `https://<주소>/` → 홈 화면
3. `test1` / `aquabit123` 로그인 → 출석 팝업
4. 다른 브라우저(또는 시크릿 창)에서 `test2` / `aquabit123` → 같은 어항에서 채팅이 **바로** 보이면 WebSocket 정상
5. `admin` / 2번의 `ADMIN_PASSWORD` → 관리자 화면
6. 브라우저 개발자 도구(F12) → Network → `WS` 필터에 `socket.io` 연결이 101로 보이면 확실

처음 보는 사람은 회원가입 후 초대 코드 `AQUA77`로 "클라우드 7팀"에 들어올 수 있습니다.

## 8. 이후

- Vercel용 수정은 `vercel` 브랜치에서 하고 push하면 자동 배포됩니다.
- 서버 라이브러리(`server/package.json`의 dependencies)를 추가하거나 바꾸면 **루트 `package.json`에도 똑같이** 넣어야 합니다. Vercel은 루트에서 설치하기 때문입니다 (빠지면 Logs에 `Cannot find module`).
- `main`의 기능 수정을 Vercel에도 반영하려면:

```powershell
git checkout vercel
git merge main
git push
git checkout main
```

- 데이터 초기화: 2번 PowerShell 명령 다시 실행 (모든 데이터와 로그인 삭제)
- 공유 끝내기: Vercel 프로젝트 Settings 맨 아래 **Delete Project**, TiDB와 Upstash도 삭제

## 문제 해결

| 증상 | 확인 |
|---|---|
| `/api/health`가 500 / `FUNCTION_INVOCATION_FAILED` | 프로젝트 → **Logs**. 대부분 DB 환경 변수 오타 |
| Logs에 `Cannot find module ...` | 루트 `package.json`의 dependencies에 그 라이브러리가 있는지 |
| `/api/...`가 404 | Production이 `vercel` 브랜치로 배포됐는지 (5번) |
| 로그인 후 바로 로그인 화면으로 | `SESSION_SECRET`, 2번 db:init 여부 |
| 채팅이 실시간으로 안 오고 2~5초 늦음 | WebSocket 연결 실패 후 폴링으로 동작 중. F12 → Console의 오류, Logs의 `[socket]`/`[redis]` 줄 확인 |
| 어떤 사람끼리만 실시간이 안 감 | 인스턴스가 나뉨. 6번 Redis 연결 |
| Logs에 `[redis] ... ECONNREFUSED` | Redis 주소 오류. 6번 환경 변수 확인 후 Redeploy |
