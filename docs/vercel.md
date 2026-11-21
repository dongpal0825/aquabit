# Vercel로 공유하기 (vercel 브랜치)

이 문서와 Vercel용 코드는 **`vercel` 브랜치**에만 있습니다. `main`은 실습실 Rocky Linux VM용이고, Vercel은 링크로 보여 주기 위한 공유용입니다.

## main(VM)과 다른 점

| | main: Rocky VM | vercel 브랜치: Vercel |
|---|---|---|
| 정적 파일 (`public/`, 게임 빌드 `public/play/`) | Node가 보냄 | Vercel이 바로 보냄 (빌드: `npm run build`) |
| 회사 홈페이지(EJS), `/api/game`, `/game-socket.io`, 문의 폼 | Node 서버 하나 (3001) | Vercel 함수 `api/index.js`가 같은 Express + Socket.IO를 실행 (`vercel.json`의 rewrites) |
| 실시간 | WebSocket, 안 되면 폴링 | **WebSocket만** (`public/community/js/realtime.js`) |
| 서버 여러 대일 때 | 해당 없음 | `REDIS_URL`/`KV_URL`이 있으면 Redis로 서로 전달 (`server/game/socket.js`) |
| DB | 같은 VM의 MySQL | TiDB Cloud (MySQL 호환, `DB_SSL=true`) |
| 게임 DB 켜기 | `.env`의 `GAME_DATABASE_ENABLED=true` | `DB_HOST`가 있으면 자동으로 켜짐 |
| 문의 저장, 사내 채팅 기록 | `data/` 폴더 | `/tmp` (Vercel이 다시 켜지면 지워짐) |
| 사내 메일 (hMailServer) | 실습실 메일 서버 | 인터넷에서 실습실 메일 서버에 접속할 수 없어서 동작하지 않음 (문의는 "접수됨(메일 전달 실패)") |

- 실시간 연결은 Vercel 함수 최대 실행 시간(300초)이 되면 끊기고, 화면이 자동으로 다시 연결해서 빠진 채팅을 채웁니다.
- 처음 접속하거나 한동안 안 쓰다 접속하면 1~3초 느릴 수 있습니다.

## 처음 설정 (한 번만)

### 1. TiDB Cloud DB

1. https://tidbcloud.com → **Create Cluster** → **Starter**(무료), 지역 **Tokyo** → **Connect**에서 **Generate Password**, `HOST`/`PORT`(4000)/`USERNAME` 메모
2. 이 PC에서 테이블과 테스트 데이터 (vercel 브랜치에서, 새 PowerShell 창):

```powershell
cd C:\Users\<사용자>\Documents\202208053\aquabit
git checkout vercel
$env:DB_HOST="gateway01.ap-northeast-1.prod.aws.tidbcloud.com"; $env:DB_PORT="4000"; $env:DB_USER="xxxx.root"; $env:DB_NAME="aquabit"; $env:DB_SSL="true"; $env:GAME_DATABASE_ENABLED="true"
$env:DB_PASSWORD="TiDB 비밀번호"
$env:ADMIN_PASSWORD="Vercel 관리자 비밀번호"
npm run db:init
npm run seed
```

`db:init`이 `aquabit` 데이터베이스까지 만듭니다. 끝나면 창을 닫으세요 (`$env:` 값은 그 창에서만 유효).

### 2. Vercel 프로젝트

1. https://vercel.com → **Continue with GitHub** (Hobby) → **Add New... → Project** → `aquabit` **Import**
2. Framework Preset **Other**, Root Directory `./`, 빌드 설정은 그대로 (`vercel.json`이 정함)
3. **Environment Variables**:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | 긴 무작위 문자열 (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | TiDB 값 (`DB_PORT`=`4000`, `DB_NAME`=`aquabit`) |
| `DB_SSL` | `true` |
| `TIME_SCALE` | `1` |
| `ADMIN_ENABLED` | `true` |

4. **Deploy** → 프로젝트 **Settings → Environments → Production → Branch Tracking**을 **`vercel`**로 바꾸고 저장 → `vercel` 브랜치에 push하면 그 버전이 Production으로 배포됩니다.

### 3. (선택) Redis

접속자가 많아 함수 인스턴스가 여러 개 뜨면 일부 사람끼리 실시간 알림이 안 갈 수 있습니다. 프로젝트 **Storage → Upstash for Redis**(무료)를 연결하면 `KV_URL`/`REDIS_URL`이 자동으로 들어가고, **Redeploy** 후 자동으로 사용합니다.

## 확인

1. `https://<주소>/api/game/health` → `{"ok":true,"databaseEnabled":true}`
2. `https://<주소>/` 회사 홈페이지 → **게임 시작** → `test1` / `aquabit123`
3. 시크릿 창에서 `test2` / `aquabit123` → 같은 어항 채팅이 물고기 위 말풍선으로 바로 보이면 WebSocket 정상
4. `admin` / 1번의 `ADMIN_PASSWORD` → 관리자 화면

## main의 수정을 Vercel에 반영

```powershell
git checkout vercel
git merge main
git push
git checkout main
```

충돌이 나면 대부분 `main` 쪽을 고르면 됩니다. 단, 아래 vercel 전용 부분은 유지합니다:
`api/index.js`, `vercel.json`, `.vercelignore`, `docs/vercel.md`, `server/game/config.js`의 `DB_SSL`·자동 켜기, `config/index.js`의 `paths.writable`, `app.js`의 `trust proxy`, `realtime.js`의 `transports: ['websocket']`, `server/game/socket.js`의 Redis 부분, `package.json`의 `redis`·`@socket.io/redis-adapter`.

## 문제 해결

| 증상 | 확인 |
|---|---|
| 화면이 500 / `FUNCTION_INVOCATION_FAILED` | Vercel 프로젝트 → **Logs**. `Cannot find module`이면 `package.json` dependencies, DB 오류면 환경 변수 |
| 로그인에서 "MySQL 설정 후 사용할 수 있어요" | `DB_HOST` 환경 변수가 비었는지 |
| 로그인에서 "게임 저장소를 사용할 수 없어요" | TiDB 접속 실패: `DB_*`, `DB_SSL=true` |
| 게임 화면이 비어 있음, `/play/...` 404 | 빌드 로그에서 `npm run build`가 성공했는지 |
| 채팅이 2~5초 늦게 옴 | WebSocket 실패 후 폴링으로 동작 중. 브라우저 F12 → Console 오류, Logs의 `[redis]` 줄 |
