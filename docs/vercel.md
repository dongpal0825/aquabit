# Vercel로 공유하기 (Windows PC 기준)

과제의 실제 운영 환경은 Rocky Linux VM([deploy.md](deploy.md))입니다. Vercel은 팀원이나 다른 사람에게 링크로 보여 주기 위한 보조 공유용입니다.

## Vercel에서 달라지는 점

| | Rocky VM / 로컬 | Vercel |
|---|---|---|
| 화면(public/) | Apache / Express | Vercel이 정적 파일로 서비스 |
| API(/api) | Node 서버 | 서버리스 함수 `api/index.js`가 같은 Express 앱을 실행 |
| 실시간 | Socket.IO | **없음**. 화면이 자동으로 폴링(채팅 2초, 어항 5초)으로 동작. 다른 사람 행동 알림 토스트는 안 뜸 |
| DB | 같은 PC/VM의 MySQL | 클라우드 MySQL 호환 DB (아래는 TiDB Cloud 무료) |
| 데이터 | 각자 따로 | 로컬, VM과 공유되지 않는 별도 DB |

- 처음 접속하거나 한동안 안 쓰다 접속하면 1~3초 느릴 수 있습니다.
- 무료(Hobby) 요금제는 함수 실행 횟수 한도가 있습니다. 어항 화면을 열어 두면 2초마다 요청이 가므로, 안 쓸 때는 탭을 닫아 주세요.

준비물: GitHub 계정(저장소 `dongpal0825/aquabit`), 이 PC의 Node.js, 프로젝트 폴더.

---

## 1. 클라우드 DB 만들기 (TiDB Cloud, 무료)

1. https://tidbcloud.com 에 가입 (GitHub나 Google 계정으로 가능)
2. **Create Cluster** → **Starter**(무료) 선택, 지역은 **Tokyo (ap-northeast-1)** 처럼 한국에서 가까운 곳 → 만들기
3. 클러스터 화면의 **Connect** 버튼
   - Connect With: **General** (또는 Node.js)
   - **Generate Password**를 눌러 비밀번호를 만들고 바로 메모 (다시 안 보여 줌)
   - `HOST`, `PORT`(4000), `USERNAME`(`xxxx.root` 모양) 메모
4. 왼쪽 메뉴 **SQL Editor**에서 실행:

```sql
CREATE DATABASE aquabit;
```

## 2. 테이블과 테스트 데이터 넣기 (이 PC에서)

PowerShell을 새로 열고 (따옴표 안을 1번에서 메모한 값으로 바꿔서) 한 줄씩:

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

- `스키마를 만들었어요: aquabit`, seed 완료 메시지가 나오면 성공
- 여기서 넣은 `$env:` 값은 이 PowerShell 창에서만 유효합니다. `server\.env`(로컬 DB 설정)는 바뀌지 않습니다. 끝나면 창을 닫으세요.
- `ER_ACCESS_DENIED_ERROR`: 사용자 이름(`xxxx.root` 전체)이나 비밀번호 확인
- `ER_BAD_DB_ERROR`: 1번 4단계의 `CREATE DATABASE aquabit;`를 안 함
- `Connections using insecure transport are prohibited`: `$env:DB_SSL="true"` 빠짐

## 3. 세션 키 만들기

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

나온 64자리 문자열을 메모합니다 (4번의 `SESSION_SECRET`).

## 4. Vercel에 올리기 (웹에서, 명령어 없음)

1. https://vercel.com → **Sign Up** → **Continue with GitHub** (요금제는 Hobby)
2. **Add New...** → **Project** → `dongpal0825/aquabit` 옆 **Import**
   (목록에 없으면 **Adjust GitHub App Permissions**에서 이 저장소 접근 허용)
3. 설정 화면
   - Framework Preset: **Other**
   - Root Directory: `./` 그대로
   - Build and Output Settings: 건드리지 않음 (저장소의 `vercel.json`이 정함)
4. **Environment Variables**에 하나씩 추가 (Key / Value):

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
| `ADMIN_ENABLED` | `true` (관리자 화면을 안 보이려면 `false`) |

   `ADMIN_PASSWORD`는 2번 seed에서 이미 계정을 만들 때 썼으므로 Vercel에는 넣지 않아도 됩니다.

5. **Deploy** → 1~2분 뒤 `https://aquabit-xxxx.vercel.app` 같은 주소가 나옵니다.

## 5. 확인

1. `https://<주소>/api/health` → `{"ok":true,"timeScale":1}`
2. `https://<주소>/` → 홈 화면
3. `test1` / `aquabit123` 로그인 → 출석 팝업
4. 다른 브라우저(또는 시크릿 창)에서 `test2` / `aquabit123` → 같은 어항 채팅이 2초 안에 보이면 정상
5. `admin` / 2번의 `ADMIN_PASSWORD` → 관리자 화면

주소를 팀원에게 보내면 됩니다. 처음 보는 사람은 회원가입 후 초대 코드 `AQUA77`로 "클라우드 7팀"에 들어올 수 있습니다.

## 6. 이후

- GitHub `main`에 push하면 Vercel이 자동으로 다시 배포합니다.
- 환경 변수를 바꾸면 Vercel 프로젝트 → **Deployments** → 최신 배포의 **⋯** → **Redeploy**를 해야 적용됩니다.
- 데이터 초기화: 2번 PowerShell 명령을 다시 실행 (모든 데이터와 로그인이 지워짐)
- 공유를 끝내려면 Vercel 프로젝트 → **Settings** → 맨 아래 **Delete Project**, TiDB 클러스터도 삭제

## 문제 해결

| 증상 | 확인 |
|---|---|
| `/api/health`가 500 또는 `FUNCTION_INVOCATION_FAILED` | Vercel 프로젝트 → **Logs**에서 오류 확인. 대부분 DB 환경 변수 오타 |
| 로그인 후 바로 로그인 화면으로 돌아감 | `SESSION_SECRET`이 들어갔는지, 2번 db:init을 했는지 |
| 화면은 뜨는데 `/api/...`가 404 | 저장소 루트에 `vercel.json`, `api/index.js`가 있는지 (최신 커밋으로 배포됐는지) |
| 콘솔에 `socket.io.js 404` | 정상. Vercel에는 Socket.IO가 없어서 폴링으로 동작합니다 |
