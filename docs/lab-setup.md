# 실습실 PC에서 AQUABIT 실행하기

집 컴퓨터에서 만든 프로젝트를 실습실 Windows PC에서 그대로 돌리는 순서입니다.
Rocky Linux VM에 올리는 것은 [deploy.md](deploy.md)를 보세요.

걸리는 시간: Node와 MySQL이 이미 깔려 있으면 10분 정도.

---

## 0. 집에서 미리 할 일

### 프로젝트 챙기기 (둘 중 하나)

**A. GitHub (추천)**: 팀원과 같이 쓰기 좋고, 실습실에서 `git clone` 한 줄이면 됩니다.

```bash
cd <집 컴퓨터의 aquabit 폴더>
git init
git add .
git commit -m "AQUABIT 1~5단계"
```

그다음 GitHub에서 빈 저장소를 만들고 안내대로 `git remote add origin ...`, `git push -u origin main`.
`.gitignore` 때문에 `node_modules/`, `server/.env`, `sql/*.local.sql`(비밀번호 들어 있음)은 올라가지 않습니다.

**B. USB**: `aquabit` 폴더를 통째로 USB에 복사한 뒤, USB 안의 복사본에서 비밀번호가 든 파일과 큰 폴더를 지웁니다. PowerShell에서 (USB가 `E:`라면):

```powershell
Copy-Item <집 컴퓨터의 aquabit 폴더> E:\aquabit -Recurse
Remove-Item E:\aquabit\server\node_modules -Recurse -Force
Remove-Item E:\aquabit\server\.env, E:\aquabit\sql\*.local.sql
```

> 학교망에서 `npm install`이 막힐 것 같으면 두 번째 줄(`node_modules` 지우기)은 건너뛰세요. 같은 Windows 64비트라면 그대로 동작합니다.

### 확인해 둘 것
- 실습실 PC에 **Node.js**(18 이상)와 **MySQL**이 깔려 있는지, 그리고 **MySQL root 비밀번호**를 아는지. 모르면 조교님께 미리 물어보세요.
- 실습실에서 인터넷(npm 설치, 글꼴 CDN)이 되는지.

---

## 1. Node.js 확인

PowerShell을 열고:

```powershell
node -v
npm -v
```

- `v18` 이상이면 통과.
- 없거나 낮으면 https://nodejs.org 에서 LTS 설치. 관리자 권한이 없으면 같은 페이지의 **Windows Binary (.zip)** 를 받아 압축을 풀고, 그 폴더에서 `.\node.exe -v` 처럼 실행하거나 그 폴더를 PATH에 추가하세요.

## 2. MySQL 확인

```powershell
Get-Service MySQL*
```

- `Running`이면 통과.
- `Stopped`면 `Start-Service MySQL80` (관리자 PowerShell 필요할 수 있음).
- 아무것도 안 나오면 MySQL이 없습니다. https://dev.mysql.com/downloads/installer/ 에서 MySQL Community Server 8.x를 설치하고, 설치 중에 정한 root 비밀번호를 기억해 두세요.

> MySQL 대신 XAMPP의 MariaDB가 깔려 있어도 대부분 동작합니다. 이 경우 `mysql.exe` 경로가 `C:\xampp\mysql\bin\mysql.exe`입니다.

## 3. 프로젝트 가져오기

```powershell
cd $HOME\Documents
git clone <저장소 주소> aquabit      # A 방법
# 또는 USB의 aquabit 폴더를 Documents에 복사 (B 방법)
cd aquabit
```

## 4. DB와 앱 전용 계정 만들기

`sql\create-user.example.sql`을 `sql\create-user.local.sql`로 복사하고, 그 안의 `change-me` 두 곳을 실습실용 비밀번호로 바꿉니다.

```powershell
Copy-Item sql\create-user.example.sql sql\create-user.local.sql
notepad sql\create-user.local.sql
```

그다음 root로 실행 (root 비밀번호를 물어봅니다):

```powershell
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' -u root -p -e "source sql/create-user.local.sql"
```

- 메시지 없이 프롬프트로 돌아오면 성공.
- `ERROR 1045 ... root`: root 비밀번호가 틀림. 한/영, Caps Lock 확인.
- MySQL 버전 폴더가 다르면 (예: `MySQL Server 8.4`) 경로를 바꿔 주세요.

## 5. 서버 설정

```powershell
cd server
Copy-Item .env.example .env
notepad .env
```

`.env`에서 바꿀 곳:

```ini
DB_PASSWORD=4번에서 정한 비밀번호
SESSION_SECRET=아무렇게나-긴-문자열-예시-a8f3k2m9x
```

나머지는 그대로 두면 됩니다 (`PORT=3000`, `SERVE_STATIC=true`, `TIME_SCALE=1`).

## 6. 설치, DB 초기화, 실행

```powershell
npm install
npm run db:init
npm run seed
npm start
```

`AQUABIT API on http://localhost:3000` 이 나오면 브라우저에서 http://localhost:3000 을 엽니다.
서버를 끄려면 그 창에서 `Ctrl + C`.

## 7. 동작 확인 체크리스트

- [ ] 홈에서 물고기가 헤엄친다
- [ ] `test1` / `aquabit123` 로그인 → 출석 보상 팝업 (+40진주)
- [ ] `클라우드 7팀` 어항 입장 → 먹이 주기로 지우 물고기 성장 (LEVEL UP!)
- [ ] 시크릿 창에서 `test2` 로그인 → 같은 어항에서 채팅이 서로 바로 보인다
- [ ] 과제 보드: `test2`이 제출 → `test1`가 승인 → `test2` 화면에 진주가 날아온다
- [ ] 새 계정 가입 → 어항 만들기 → 초대 코드로 다른 계정이 참여

발표나 시연 전에 데이터를 처음 상태로 돌리려면 서버를 끄고:

```powershell
npm run db:init
npm run seed
npm start
```

### 시간 빨리 감기 (배고픔/시무룩 시연)

`.env`에서 `TIME_SCALE=3600`으로 바꾸고 서버를 다시 켜면 1초가 1시간이 됩니다.
먹이를 준 물고기가 24초 뒤 배고픔, 72초 뒤 시무룩이 됩니다. 시연이 끝나면 `1`로 돌려 놓으세요.

---

## 8. 문제 해결

| 증상 | 해결 |
|---|---|
| `npm install`이 오래 걸리거나 실패 | 학교망이 npm을 막는 경우. 휴대폰 핫스팟으로 바꾸거나, 집에서 `server\node_modules`까지 같이 복사해 오기 (같은 Windows 64비트면 그대로 동작) |
| `bcrypt` 관련 오류 | Node 버전이 집과 다를 때. `npm rebuild bcrypt` 또는 `server\node_modules`를 지우고 `npm install` |
| `ER_ACCESS_DENIED_ERROR ... 'aquabit'` | `.env`의 `DB_PASSWORD`와 4번 비밀번호가 다름 |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL 서비스가 꺼져 있음. `Start-Service MySQL80` |
| `ER_BAD_DB_ERROR` | 4번을 건너뜀. DB와 계정부터 만들기 |
| `EADDRINUSE :::3000` | 3000번을 다른 프로그램이 씀. `.env`에서 `PORT=3001`로 바꾸고 http://localhost:3001 |
| 글자가 픽셀 글꼴이 아님 | 인터넷이 안 돼서 글꼴 CDN을 못 불러옴. 기능은 그대로 동작 |
| 로그인했는데 자꾸 로그인 화면으로 | `npm run db:init`을 하면 로그인이 모두 풀립니다. 다시 로그인 |
| 실시간 알림이 안 옴 | 새로 고침. 그래도 안 되면 자동으로 2~5초 폴링으로 동작합니다 |

## 9. 끝나고 정리 (공용 PC라면)

- `Ctrl + C`로 서버 끄기
- 프로젝트 폴더 삭제 (`.env`에 DB 비밀번호가 들어 있음)
- DB와 계정도 지우려면 root로:

```powershell
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' -u root -p -e "DROP DATABASE aquabit; DROP USER 'aquabit'@'localhost'; DROP USER 'aquabit'@'127.0.0.1';"
```
