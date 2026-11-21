# AQUABIT (아쿠아비트)

> 작은 창작이 모여 하나의 세상이 되다.

클라우드 컴퓨팅 팀 프로젝트용 **가상 게임 회사 AQUABIT**의 웹 서비스입니다. Node 서버 하나가 두 가지를 함께 서비스합니다.

- **회사 홈페이지** (`www.aquabit.lab`): 회사 소개, 게임 소개, 공지, 채용, 고객센터(문의 폼), 사내 메일
- **Pixel Aquarium** (팀 어항 게임): 팀 어항을 만들고 초대 코드로 팀원을 불러 각자 PNG 도트 물고기를 키우고, 대표가 과제를 주면 진주를 받아 먹이·장식을 삽니다. 채팅과 알림은 Socket.IO로 실시간입니다.

> AQUABIT은 실제 회사가 아닙니다.

## 구성

```
브라우저 ─▶ Apache :80 ─▶ Node(Express) 127.0.0.1:3001 ─▶ MySQL 127.0.0.1:3306
                           ├─ /                 회사 홈페이지 (EJS)
                           ├─ /community/       팀 어항 화면 (로그인, 내 어항, 어항, 관리자)
                           ├─ /play/            Vue + PixiJS 게임 빌드 결과 (+ 혼자 해 보는 체험 어항)
                           ├─ /api/game/        게임 API (회원, 어항, 물고기, 과제, 상점, 채팅, 관리자)
                           ├─ /game-socket.io/  실시간 (Socket.IO)
                           └─ /support 등       문의 폼, 사내 메일
```

- Node.js 22.12 이상, Express 5, EJS, express-session + bcryptjs, mysql2, Socket.IO
- 게임 화면: Vue 3 + PixiJS를 **Vite로 빌드** (`game/` 소스 → `public/play/`)
- 외부 CDN·폰트·이미지 없이 동작 (학교 내부망용)

## 페이지

| 주소 | 내용 |
|---|---|
| `/` | Canvas 픽셀 아쿠아리움 배너, 최신 공지 3개, 서비스 특징 |
| `/about`, `/game` | 회사 소개 (팀 역할, 서비스 구성), 게임 소개 |
| `/notices`, `/careers`, `/support` | 공지 (분류 필터), 채용, FAQ와 1:1 문의 |
| `/community/login.html` | 로그인·회원가입 (DB가 없으면 **체험하기**) |
| `/community/tanks.html` | 내 어항 목록, 어항 만들기, 초대 코드로 참여 |
| `/community/tank.html?id=` | 어항 게임 화면: 먹이, 꾸미기, 과제, 상점, 팀, 채팅, 사내 메일, 어항 설정 |
| `/community/admin.html` | 관리자 화면 (어항 수정·삭제, 사용자 소속 보기, 진주·아이템 지급, 공지) |
| `/play/` | 계정 없이 혼자 해 보는 체험 어항 (브라우저에 저장) |

## 게임 규칙 요약

- 어항당 최대 10명, 사람마다 물고기 1마리. 어항을 만든 사람이 대표 (삭제·대표 넘기기 가능, 팀원은 나가기)
- 물고기 7종(금붕어, 구피, 베타, 네온테트라, 새우, 엔젤피쉬, 불가사리), 색 7가지 + 색상 슬라이더
- 출석 10진주, 7일 연속 보너스 30진주. 상점: 먹이 5, 리본 30, 꽃 60, 왕관 120진주
- 먹이는 **내 물고기나 팀원 물고기**에게 줄 수 있고, 물고기 한 마리는 하루 5번까지
- 받은 먹이 누적으로 레벨 업: Lv.1(0) → Lv.2(5) → Lv.3(15) → Lv.4(40). 장식은 리본 Lv.2, 꽃 Lv.3, 왕관 Lv.4부터 착용
- 24시간 굶으면 배고픔, 72시간이면 시무룩 (죽지 않음, 먹이를 받으면 회복)
- 과제: 대표가 팀원에게 등록(보상 20~100진주) → 담당자 제출 → 대표 승인 시 진주 지급

## 폴더 구조

```
server.js, app.js     서버 시작, Express 설정 (홈페이지 + 게임 API + 실시간을 한 앱으로)
config/index.js       .env 읽기 (홈페이지, 메일)
routes/ lib/ views/   회사 홈페이지 (라우터, 메일·문의 처리, EJS 화면)
data/                 공지·채용·FAQ·팀·연혁 JSON (고치면 바로 반영)
server/game/          게임 API: config, db, socket, lib/, routes/(auth, tanks, fish, messages, tasks, economy, admin)
game/                 Vue + PixiJS 게임 소스, 도트 PNG 원본(game/public/assets)
public/               홈페이지 정적 파일, community/(팀 어항 화면 HTML·CSS·JS)
public/play/          게임 빌드 결과 (git에 올리지 않음, npm run build가 생성)
sql/schema.sql        DB 스키마 (기존 데이터를 지우지 않는 형태)
scripts/              db:init, db:migrate, seed, admin:create, 게임 빌드, 그림 내보내기
artwork/              그림 작업 원본과 기록
tests/                자동 테스트 (npm test)
docs/                 API, 배포, 실습실 순서표, 통합 안내
```

## 내 PC에서 실행하기

### DB 없이 화면만 보기

```bash
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
npm start                   # 게임을 빌드한 뒤 http://127.0.0.1:3001 에서 실행
```

홈페이지 → **게임 시작** → **체험하기**로 어항을 둘러볼 수 있습니다 (이 브라우저에만 저장).

### MySQL과 함께 (회원, 팀 어항, 실시간)

1. MySQL에 DB와 앱 계정 만들기: `sql/create-user.example.sql`을 `sql/create-user.local.sql`로 복사해 비밀번호를 바꾸고 root로 실행
2. `.env`에서 `GAME_DATABASE_ENABLED=true`, `DB_PASSWORD`, `SESSION_SECRET`, `ADMIN_PASSWORD` 채우기
3. 테이블과 테스트 데이터:

```bash
npm run db:init     # 게임 테이블을 새로 만듦 (기존 게임 데이터 삭제)
npm run seed        # test1·test2·test3 (비밀번호 aquabit123), 어항 "클라우드 7팀"(AQUA77), 과제 2개, admin
npm start
```

- 시크릿 창으로 test1, test2를 동시에 로그인하면 같은 어항의 채팅·먹이·과제 알림이 실시간으로 보입니다.
- `npm run dev`: 서버 파일을 고치면 자동으로 다시 켜짐. 게임(`game/`) 코드를 고쳤으면 `npm run build` 후 새로고침

## npm 명령

| 명령 | 하는 일 |
|---|---|
| `npm start` / `npm run dev` | 게임 빌드 후 서버 실행 (dev는 파일 변경 시 자동 재시작) |
| `npm run build` | 게임만 다시 빌드 (`public/play/`) |
| `npm run db:init` | 게임 테이블을 지우고 새로 만듦 (**게임 데이터 삭제**) |
| `npm run db:migrate` | 데이터를 지우지 않고 테이블 만들기·확장 (예전 이름 `db:game:init`) |
| `npm run seed` | 테스트 계정·어항·과제 넣기 (`db:init` 뒤에) |
| `npm run admin:create` | `.env`의 관리자 계정 만들기·비밀번호 다시 맞추기 |
| `npm test` | 자동 테스트 |

## 환경 변수 (.env)

`.env.example`을 복사해서 씁니다. `.env`는 git에 올라가지 않습니다. 비밀번호는 `.env`에만 적으세요.

| 이름 | 기본값 | 설명 |
|---|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `3001` | 서버 주소. Apache 뒤에서는 `127.0.0.1` 그대로 (VM 밖에서 3001로 바로 못 들어옴) |
| `NODE_ENV` | `development` | 운영 서버는 `production` |
| `GAME_URL` | `/community/login.html` | 홈페이지 "게임 시작" 버튼 주소 |
| `GAME_DATABASE_ENABLED` | `false` | `true`면 MySQL로 회원·어항 저장 (아니면 체험하기만) |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | | MySQL 접속 |
| `SESSION_SECRET` | | 로그인 쿠키 서명 키 (긴 무작위 문자열) |
| `TIME_SCALE` | `1` | 시간 배속 (3600이면 1초=1시간, 배고픔·시무룩 시연용) |
| `ADMIN_ENABLED` `ADMIN_USERNAME` `ADMIN_PASSWORD` | `true` `admin` | 관리자 계정 |
| `SMTP_*` `MAIL_*` | | 문의 메일 발송 (사내 hMailServer) |
| `WEBMAIL_*` | | 어항 화면의 사내 메일 (POP3/SMTP) |

## 실습실 서버에 올리기

- **Rocky Linux 10 web VM**: [docs/lab-deploy-checklist.md](docs/lab-deploy-checklist.md) (단계별 순서표, 확인 명령 포함)
- 구성 설명과 Apache·systemd 설정: [docs/deploy.md](docs/deploy.md)
- API와 실시간 이벤트: [docs/api.md](docs/api.md)
- 팀원 디자인 통합 내역: [docs/community-integration.md](docs/community-integration.md)

## 게임 화면 수정

- 게임 소스는 game/ 폴더, 실제 도트 원본은 game/public/assets/ 폴더입니다.
- 물고기는 48×32, 수초는 32×48, 물과 광선은 128×128 PNG입니다. 랜딩페이지의 파란 물·짙은 외곽선·노란 모래 팔레트를 사용합니다.
- 물고기 원본은 `fish-gold.png`(금붕어), `fish-angel.png`(엔젤피쉬), `fish-betta.png`(베타), `fish-guppy.png`(구피), `fish-neon.png`(네온테트라), `fish-shrimp.png`(새우)입니다. `game/public/assets/`의 파일을 수정하세요. `public/play/`는 빌드할 때 만들어지는 결과물이므로 원본 편집에 사용하지 않습니다.
- 종류마다 PNG가 두 장입니다. 예: `fish-gold.png` + `fish-gold-2.png`, `fish-shrimp.png` + `fish-shrimp-2.png`. 모두 48×32 투명 이미지이며 머리·몸·장식의 기준점은 동일하게 유지하고 꼬리/다리만 바꿉니다. 물고기는 0.26초, 새우는 기어갈 때 0.18초마다 프레임을 바꿉니다. 새우를 잡거나 낙하 중일 때는 다리가 멈추고, 일시정지하면 프레임도 멈춥니다. PNG 저장은 첫 번째 프레임의 정지 이미지입니다.
- 어항 배경은 `game/aquarium/scenery.js`에서 메인 `public/js/aquarium.js`와 같은 4~5px 격자, 줄 단위 수초 흔들림, 광선 이동 방식을 사용합니다. 그림은 PNG에서 읽고, 광선은 물고기 앞쪽에 별도로 표시합니다.
- 배경에는 네온테트라 PNG를 옅은 실루엣으로 표시한 작은 무리가 천천히 지나갑니다. 배경 블러 안쪽에 있고 이름·드래그·먹이 판정에는 참여하지 않으며 일시정지 상태를 따릅니다.
- 2026-11-19 금붕어·베타·구피·네온테트라를 먼저 교체하고, 추가 요청으로 새우·엔젤피쉬도 같은 스타일로 교체했습니다. 이전 8개 파일은 `artwork/history/2026-11-19-before-fish-style/`, 사용자 새우·엔젤피쉬 원본 4개는 `artwork/history/2026-11-19-before-angel-shrimp/`에 보관했습니다. 비교 그림과 생성 기록은 `artwork/style-update-2026-11-19/`에 있습니다.
- 광선은 `game/aquarium/landing-light.mjs`에서 메인페이지의 광선 반복문을 그대로 사용합니다. 기본 수중 기포는 `bubble-dot.png`(1×1)로 바닥에서 수면까지 반복 상승합니다. 물고기가 뱉는 기포는 기존 `bubble.png`를 사용합니다.
- 게임 광선은 메인과 같은 움직임을 유지하며, 너비 9칸(기존 6칸), 길이는 모래 윗면까지(기존 80%)로 표시합니다.
- 새우는 수면까지 드래그할 수 있습니다. 놓으면 천천히 가라앉아 발끝이 모래에 닿는 위치에서 좌우로 기어다니고, 바닥 먹이만 따라갑니다.
- 새우는 떨어지는 먹이에 반응해 작게 점프한 뒤 착지합니다. 먹이는 모래 위에 남고 새우는 바닥 알갱이만 주워 먹습니다. 이전처럼 내 생물만 먹이에 반응합니다.
- 테스트용 먹이는 처음 10개 지급됩니다. 밥통에서 실제 떨어뜨린 수만큼 먼저 차감·저장한 뒤 생성하므로 새로고침해도 남은 수량이 유지되며 0개일 때는 더 떨어지지 않습니다. 수조 오른쪽 아래에서 잔량을 볼 수 있습니다.
- 수초 설정은 그림 카드로 선택합니다. 오른쪽 위 정보 아이콘에서 사용 가이드를 열고, 왼쪽 도구 모음에서 일시정지할 수 있습니다. 버튼 아이콘도 `icon-*.png`(16×16 투명 PNG)로 따로 저장되어 있습니다.
- PNG를 직접 편집한 뒤 `npm run build`하면 바뀐 이미지 버전이 적용됩니다. `node scripts/export-game-art.cjs`는 랜딩 팔레트로 원본을 다시 생성하므로 직접 수정한 PNG를 덮어씁니다.
- 장식 원본은 accessory-bow.png(리본), accessory-flower.png(꽃), accessory-crown.png(왕관), effect-sparkle.png(반짝이)입니다. 모두 48×32 투명 PNG이며 그림을 수정할 때 투명 여백과 크기를 유지합니다.
- 꾸미기 창의 물고기 PNG 저장은 꾸민 물고기를, 장식 PNG 저장은 물고기를 제외한 장식·효과를 저장합니다.
- 원본 PNG는 48×32를 유지하며, 어항에서는 PC 기준 가로 180px·모바일 기준 120px로 확대 표시합니다(작은 어항은 화면에 맞춰 제한). 장식과 후광도 같은 비율로 움직입니다.
- 먹이는 현재 사용자의 물고기만 따라가서 먹고 경험치를 얻습니다. 다른 물고기의 경험치는 바뀌지 않습니다. 로컬 저장소와 화면 명령에서도 타인 물고기의 먹이 보상을 거부합니다.
- 로고 이미지는 `public/img/logo.png`(232×36, 투명 배경), `logo-pixel.png`(58×9 도트 원본), `logo-light.png`(232×36, 흰 글자)입니다. 편집 가능한 SVG 원본은 그대로 유지합니다. SVG를 수정하면 `node scripts/export-logo.cjs`로 PNG를 다시 저장할 수 있습니다.
- npm start와 npm run dev는 게임을 빌드하고 회사 서버를 실행합니다. 게임 코드를 고치면 npm run build 후 새로고침하세요.
- public/play/는 빌드 결과라 Git에서 제외합니다. 소스와 package-lock.json으로 다시 만들 수 있습니다.
- 게임 빌드에는 Vite가 필요합니다. 실습 서버에서 npm ci --omit=dev로 설치한다면 npm ci가 되는 개발 PC에서 먼저 npm run build를 실행하고 public/play/를 함께 옮긴 뒤 node server.js로 실행하세요. 서버에서 직접 빌드하려면 npm ci로 개발 도구까지 설치합니다.

## 문의 폼 동작

1. 서버에서 입력 검사: 이름, 이메일 형식, 분류, 제목, 내용 10자 이상, 개인정보 동의
2. 통과하면 `data/inquiries.json`에 저장 → nodemailer로 `MAIL_TO`에 메일 발송
3. 메일 발송이 실패해도 저장은 유지하고 "접수됨(메일 전달 실패)"으로 안내 (`mailStatus: "failed"` 기록)
4. 중복 접수 방지: 접수 후 결과 화면으로 이동(POST → 303 → GET)하고, 폼마다 한 번만 쓰는 토큰을 사용
5. 스팸 방지: 보이지 않는 honeypot 칸, 같은 IP는 10분에 5건까지

접수된 문의 보기: `cat data/inquiries.json`

## 보안

- helmet 보안 헤더 적용. HTTP 사이트라서 `upgrade-insecure-requests`와 HSTS는 끔
- 인라인 스크립트 없이 CSP를 엄격하게 적용 (`script-src 'self'`)
- 화면 출력은 EJS `<%= %>` 자동 이스케이프
- 비밀번호는 `.env`에만 두고, `.env`와 `data/inquiries.json`은 `.gitignore`로 제외

## 내용 수정

| 바꿀 것 | 파일 |
|---|---|
| 공지 | **관리자 화면 → 홈페이지 공지** 탭에서 추가·수정·삭제 (DB `site_notices`). DB를 쓰지 않을 때만 `data/notices.json`을 읽고, DB를 처음 만들 때 이 파일의 공지를 가져옴 |
| 채용 공고 | `data/careers.json` |
| FAQ | `data/faq.json` |
| 팀 역할 | `data/team.json` (`icon`: server, globe, code, mail / `color`: coral, yellow, mint, violet) |
| 연혁 | `data/history.json` |

JSON 문법이 틀리면 그 목록이 비어 보이고 서버 로그에 `읽기 실패`가 남습니다.

## 우리 어항의 채팅·사내 메일 (수업 외 내용)

GitHub 팀 어항을 합친 새 게임은 [팀 어항 통합 안내](docs/community-integration.md)를 참고하세요. 홈페이지의 게임 시작은 `/community/login.html`로 연결되며, DB가 없는 노트북에서는 **체험하기**로 확인합니다. 아래 설명의 기존 체험 어항은 `/play/`에 남아 있습니다.

왼쪽 편지 아이콘을 누르면 **채팅 / 메일** 탭이 열립니다. 채팅은 같은 웹 서버에 접속한 사람끼리 공유하며 3초 간격으로 새 내용을 확인합니다. 현재 게임의 닉네임을 표시하며, 회사 메일 로그인과는 별도로 동작합니다.

메일 탭에서는 hMailServer에 등록된 개인 메일 계정으로 로그인합니다. 받은 메일 확인·답장·새 메일 보내기와 웹에서 보낸 메일 확인을 지원합니다. 메일 계정 비밀번호는 서버 메모리에만 보관하며 파일이나 브라우저 저장소에 저장하지 않습니다. 로그아웃하면 지워지고, 세션은 마지막 사용 후 1시간에 만료됩니다. 첨부파일은 이름만 표시하며 내려받기는 지원하지 않습니다. 받은 메일은 서버에서 삭제하지 않습니다.

현재 실습 서버에 맞춘 `.env` 설정:

```dotenv
WEBMAIL_HOST=192.168.163.162
WEBMAIL_SERVER_NAME=mail.aquabit.lab
WEBMAIL_DOMAIN=aquabit.lab
WEBMAIL_SMTP_PORT=25
WEBMAIL_POP_PORT=110
WEBMAIL_SMTP_SECURE=false
WEBMAIL_POP_SECURE=false
WEBMAIL_STARTTLS=false
```

`mail.aquabit.lab`은 서버 이름이고, 메일 주소의 도메인은 `aquabit.lab`입니다. 설정을 변경한 뒤 Node.js 서버를 다시 실행하세요. 노트북 개발 중에는 실제 메일 서버 연결 테스트를 하지 않고, 나중에 해당 실습 네트워크에서 송수신을 확인합니다. 메일 탭을 열기만 하면 메일 서버에 접속하지 않습니다. 메일 계정 로그인부터 접속합니다.

채팅은 `data/aquarium-chat.json`, 웹에서 보낸 메일 기록은 `data/aquarium-sent-mail.json`에 저장합니다. 두 파일과 `.env`는 Git 업로드에서 제외합니다. 웹에서 보낸 메일 목록에는 Thunderbird에서 보낸 메일이 포함되지 않습니다.

로컬 검사 명령:

```bash
node --test tests/game-simulation.test.mjs tests/communications.test.cjs
```

통신 테스트는 테스트용 임시 저장소와 노트북 내부의 가짜 SMTP·POP3 서버를 사용합니다. 실제 사내 메일 서버에는 접속하지 않습니다.
