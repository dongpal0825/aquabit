# AQUABIT (아쿠아비트)

> 작은 창작이 모여 하나의 세상이 되다.

팀 어항을 만들고 초대 코드로 팀원을 불러, 각자 픽셀 물고기를 키우는 팀 프로젝트 서비스입니다.
대표가 과제를 주고, 팀원이 완료하면 진주를 받아 먹이와 장신구를 사서 물고기를 키웁니다.

## 구성

```
aquabit/
├─ public/          정적 프론트엔드 (빌드 없음: HTML + CSS + JS, 어항은 Canvas)
│  ├─ index.html    홈 (회사 소개)
│  ├─ login.html    로그인 / 회원가입
│  ├─ tanks.html    내 어항 목록 (만들기, 코드로 참여)
│  ├─ tank.html     어항 게임 화면 (HUD, 채팅, 먹이, 꾸미기, 과제 보드, 상점, 진주 내역, 팀)
│  ├─ css/          base(공통 픽셀 UI) / home / pages / game / fx(팝업과 연출)
│  └─ js/           api, pixel-art(글자 지도 + 팔레트), tank-scene(Canvas 어항), fx(팝업, 진주, 효과음),
│                   realtime(Socket.IO), pages/* (home, login, tanks, tank, tasks-board)
├─ server/          Node.js (Express) API
│  ├─ src/          index, socket(Socket.IO), config, db, lib/(game, pearls, realtime...), routes/
│  └─ scripts/      init-db.js, seed.js
├─ sql/             schema.sql (스키마), create-user.example.sql (DB 계정 만들기)
└─ docs/            api.md (API, Socket.IO 이벤트), deploy.md (Rocky Linux 10 배포), lab-setup.md (실습실 PC에서 실행)
```

운영에서는 Apache가 `public/`을 `/var/www/html`에서 서비스하고 `/api`, `/socket.io`만 Node(3000)로 프록시합니다.
로컬에서는 편의상 Express가 `public/`도 함께 서비스합니다 (`SERVE_STATIC=true`).

## 로컬 실행

필요한 것: Node.js 18 이상, MySQL 8.0

### 1. DB와 계정 만들기 (처음 한 번)

MySQL root로 접속해서 아래를 실행합니다. 비밀번호는 원하는 값으로 바꾸세요.

```sql
CREATE DATABASE IF NOT EXISTS aquabit DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'aquabit'@'localhost' IDENTIFIED BY '비밀번호';
CREATE USER IF NOT EXISTS 'aquabit'@'127.0.0.1' IDENTIFIED BY '비밀번호';
GRANT ALL PRIVILEGES ON aquabit.* TO 'aquabit'@'localhost';
GRANT ALL PRIVILEGES ON aquabit.* TO 'aquabit'@'127.0.0.1';
FLUSH PRIVILEGES;
```

또는 [sql/create-user.example.sql](sql/create-user.example.sql)을 `sql/create-user.local.sql`로 복사해 비밀번호를 바꾼 뒤 실행합니다 (`*.local.sql`은 git에서 제외). Windows PowerShell 예:

```powershell
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' -u root -p -e "source sql/create-user.local.sql"
```

### 2. 서버 설정과 실행

```bash
cd server
cp .env.example .env        # DB_PASSWORD, SESSION_SECRET 수정
npm install
npm run db:init             # 테이블 생성 (기존 데이터 삭제됨)
npm run seed                # 테스트 데이터
npm start                   # http://localhost:3000
```

개발 중에는 `npm run dev`로 파일이 바뀌면 자동으로 다시 시작합니다.

### 테스트 계정 (seed)

| 아이디 | 비밀번호 | 닉네임 | 비고 |
|---|---|---|---|
| test1 | aquabit123 | 민규 | `클라우드 7팀` 대표, 물고기 3단계 |
| test2 | aquabit123 | 수빈 | 물고기 2단계, 배고픔 상태 |
| test3 | aquabit123 | 지우 | 물고기 1단계, 시무룩 상태 |

어항 `클라우드 7팀`의 초대 코드는 `AQUA77`입니다. 과제 2개와 진주, 먹이가 조금 들어 있습니다.

여러 사람 흉내를 내려면 브라우저 일반 창과 시크릿 창에서 서로 다른 계정으로 로그인하세요.

### 시간 배속 (TIME_SCALE)

`.env`의 `TIME_SCALE`로 물고기 상태(24시간 배고픔, 72시간 시무룩) 판정 시간을 빠르게 할 수 있습니다.
예: `TIME_SCALE=3600`이면 1초가 1시간이라 24초 뒤에 배고픔, 72초 뒤에 시무룩이 됩니다.

## 직접 해 보기 (seed 기준)

1. `test1`로 로그인하면 **출석 보상 팝업**이 떠요. 어제까지 6일 연속이라 오늘 7일 보너스까지 +40진주.
2. `클라우드 7팀` 어항에 들어가서
   - **먹이 주기**를 누르고 아래 목록에서 `지우`를 고른 뒤 어항을 누르면, 그 자리로 먹이가 떨어지고 물고기가 쫓아가 먹어요. 지우의 물고기는 먹이 1개면 꼬마로 자라서 **LEVEL UP!**이 떠요.
   - 물고기를 누르면 캐릭터 카드(단계 게이지, 다음 단계까지 남은 먹이, 상태)가 열려요.
   - **상점**에서 먹이와 장신구를 사고, **꾸미기**에서 착용해요.
   - HUD의 진주 숫자를 누르면 **진주 내역**이 보여요.
   - **과제** 버튼에 빨간 배지가 있으면 처리할 과제가 있다는 뜻이에요. 대표는 등록, 승인, 반려를 하고 담당자는 증빙 링크로 제출해요.
3. 시크릿 창에서 `test2`으로 같은 어항에 들어가면 채팅, 먹이 주기, 과제 승인이 상대 화면에 바로 토스트로 떠요 (Socket.IO).
4. 설정(톱니바퀴)에서 효과음을 켤 수 있어요 (기본 꺼짐).
5. **팀** 메뉴에서 대표는 다른 팀원에게 대표를 넘기거나 어항을 삭제(어항 이름 입력 필요)하고, 팀원은 어항을 나갈 수 있어요.

## 개발 단계

1. ✅ 로그인, 어항, 물고기, 채팅
2. ✅ 진주, 출석, 상점, 먹이, 성장
3. ✅ 과제 보드
4. ✅ Socket.IO 실시간 전환 (끊기면 자동으로 폴링)
5. ✅ 어항 화면 게임 연출과 효과

API와 Socket.IO 이벤트는 [docs/api.md](docs/api.md), 서버 배포는 [docs/deploy.md](docs/deploy.md), 실습실 PC에서 실행하는 방법은 [docs/lab-setup.md](docs/lab-setup.md)를 보세요.
