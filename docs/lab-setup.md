# 실습실 Windows PC에서 실행하기

실습실 Windows PC에서 바로 돌려 보는 순서입니다. Rocky Linux VM에 올리는 것은 [lab-deploy-checklist.md](lab-deploy-checklist.md)를 보세요.

준비: **Node.js 22.12 이상** (`node -v`), MySQL (없으면 DB 없이 "체험하기"만 가능), 인터넷 (npm 설치용).

## 1. 프로젝트 받기

PowerShell에서:

```powershell
cd $HOME\Documents
git clone https://github.com/dongpal0825/aquabit.git
cd aquabit
npm install
Copy-Item .env.example .env
```

git이 없으면 GitHub 저장소 화면의 **Code → Download ZIP**으로 받아 압축을 풀어도 됩니다.

## 2-A. DB 없이 화면만 보기

```powershell
npm start
```

`http://127.0.0.1:3001` → **게임 시작** → **체험하기**. 끄려면 `Ctrl + C`.

## 2-B. MySQL과 함께

1. DB와 앱 계정 만들기:

```powershell
Copy-Item sql\create-user.example.sql sql\create-user.local.sql
notepad sql\create-user.local.sql
```

`change-me` 두 곳을 비밀번호로 바꾸고 저장한 뒤 root로 실행합니다 (root 비밀번호를 물어봄):

```powershell
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' -u root -p -e "source sql/create-user.local.sql"
```

2. `notepad .env`로 열어 아래를 채웁니다:

```ini
GAME_DATABASE_ENABLED=true
DB_PASSWORD=1번에서 정한 비밀번호
SESSION_SECRET=아무렇게나-긴-문자열-예시-a8f3k2m9x
ADMIN_PASSWORD=관리자 비밀번호
```

3. 테이블, 테스트 데이터, 실행:

```powershell
npm run db:init
npm run seed
npm start
```

`http://127.0.0.1:3001` → 게임 시작 → `test1` / `aquabit123`. 시크릿 창에서 `test2`로 로그인하면 실시간 채팅을 확인할 수 있습니다.

## 문제 해결

| 증상 | 해결 |
|---|---|
| `npm install` 실패 | 학교망이 막는 경우. 휴대폰 핫스팟 |
| `ER_ACCESS_DENIED_ERROR` | `.env`의 `DB_PASSWORD`와 1번 비밀번호가 다름 |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL 꺼짐. `Start-Service MySQL80` |
| 로그인에서 "MySQL 설정 후 사용할 수 있어요" | `.env`의 `GAME_DATABASE_ENABLED=true` 확인 후 서버 재시작 |
| `3001번 포트가 이미 사용 중` | `.env`의 `PORT`를 다른 번호로 |

## 끝나고 정리 (공용 PC)

`Ctrl + C`로 서버를 끄고 `aquabit` 폴더를 지웁니다 (`.env`에 비밀번호가 있음).
