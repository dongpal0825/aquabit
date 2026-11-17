# AQUABIT API

- 기본 경로: `/api`
- 요청/응답 본문: JSON (`Content-Type: application/json`)
- 인증: 로그인하면 `aquabit.sid` 세션 쿠키가 발급됩니다 (express-session, MySQL 저장). 이후 요청은 쿠키로 인증합니다.
- 오류 응답: `{ "error": "사용자에게 보여 줄 한국어 메시지", "code": "선택적 오류 코드" }`

| 상태 | 의미 |
|---|---|
| 400 | 입력값 오류 (메시지에 이유) |
| 401 | 로그인 필요 (`UNAUTHORIZED`) 또는 로그인 실패 (`BAD_LOGIN`) |
| 403 | 권한 없음 |
| 404 | 없거나 참여하지 않은 어항 |

> 1~5단계 전체 기준입니다.

---

## 인증

### POST /api/auth/register
회원가입 후 바로 로그인 상태가 됩니다.

```json
{ "username": "tester1", "password": "secret12", "nickname": "테스터" }
```
- `username`: 영문, 숫자, `_` 4~20자 (중복 시 400 `DUP_USERNAME`)
- `password`: 6~72자 (bcrypt 해시로 저장)
- `nickname`: 1~12자

응답 201: `{ "user": { "id", "username", "nickname", "pearls" } }`

### POST /api/auth/login
```json
{ "username": "test1", "password": "aquabit123" }
```
응답 200: `{ "user": {...} }` / 실패 401 `BAD_LOGIN`

### POST /api/auth/logout
세션 삭제. 응답 `{ "ok": true }`

### GET /api/auth/me
현재 로그인한 사용자. 응답 `{ "user": {...} }` / 401

---

## 어항

### GET /api/tanks
내가 참여한 어항 목록.

```json
{ "tanks": [ {
  "id": 1, "name": "클라우드 7팀", "inviteCode": "AQUA77",
  "isOwner": true, "ownerNickname": "민규",
  "memberCount": 3, "maxMembers": 10,
  "myFish": { "species": "goldfish", "color": "orange", "stage": 3, "accessory": "ribbon" }
} ] }
```

### POST /api/tanks
어항 만들기. 만든 사람이 대표가 되고 6자리 초대 코드(헷갈리는 0 O 1 I L 제외)가 발급되며, 대표의 물고기가 생깁니다.

```json
{ "name": "클라우드 7팀" }
```
응답 201: `{ "tank": { "id", "name", "inviteCode" } }`

### POST /api/tanks/join
초대 코드로 참여. 대소문자 구분 없음. 참여하면 내 물고기가 생깁니다.

```json
{ "code": "AQUA77" }
```
- 새로 참여: 201 `{ "tank": { "id", "name" }, "joined": true }`
- 이미 참여 중: 200 `{ ..., "joined": false }`
- 없는 코드: 404 / 10명 가득: 400 `TANK_FULL`

인원 검사는 어항 행을 `SELECT ... FOR UPDATE`로 잠근 트랜잭션 안에서 해서 동시에 들어와도 10명을 넘지 않습니다.

### GET /api/tanks/:tankId
어항 상세 (참여자만).

```json
{
  "tank": { "id": 1, "name": "클라우드 7팀", "inviteCode": "AQUA77", "ownerId": 1, "maxMembers": 10 },
  "me": { "userId": 1, "isOwner": true },
  "members": [ { "userId": 1, "nickname": "민규", "isOwner": true, "joinedAt": "..." } ],
  "fish": [ {
    "id": 1, "tankId": 1, "userId": 1, "ownerNickname": "민규",
    "name": "뽀글이", "species": "goldfish", "color": "orange", "accessory": "ribbon",
    "foodTotal": 17, "stage": 3, "stageName": "어른",
    "nextStageAt": 40, "foodToNext": 23,
    "status": "healthy", "lastFedAt": "...",
    "fedToday": 2, "dailyFeedLimit": 5
  } ],
  "pendingTasks": 1,
  "serverTime": "..."
}
```
- `species`: `goldfish` 금붕어 / `tropical` 열대어 / `puffer` 복어
- `color`: `orange` `coral` `lemon` `mint` `sky` `grape`
- `stage`: 1 아기(0) → 2 꼬마(5) → 3 어른(15) → 4 반짝(40), 내려가지 않음
- `status`: `healthy` 건강함 / `hungry` 24시간 굶음 / `sad` 72시간 굶음 (`TIME_SCALE` 반영)
- `fedToday`: 오늘(한국 시간) 받은 먹이 수, 하루 최대 5
- `pendingTasks`: 내가 처리할 과제 수 (대표: 검토 대기, 팀원: 할 일 + 반려됨). 액션 바의 빨간 배지

### POST /api/tanks/:tankId/leave
어항 나가기 (팀원만). 대표는 400 `OWNER_CANNOT_LEAVE` (먼저 대표를 넘기거나 어항 삭제).

- 내 물고기와 먹이 기록이 지워지고, 내가 맡은 **끝나지 않은** 과제(todo, submitted, rejected)도 지워집니다.
- 승인된 과제, 채팅, 진주/먹이/장신구와 진주 내역은 남습니다.

응답: `{ "ok": true, "removedTasks": 1 }` / 소켓 `member:left`

### POST /api/tanks/:tankId/transfer
대표 넘기기 (대표만, 이 어항의 다른 팀원에게).

```json
{ "userId": 2 }
```
- 대표는 자기 자신에게 과제를 줄 수 없으므로, 새 대표가 맡고 있던 끝나지 않은 과제는 지워집니다.
- 넘긴 사람은 일반 팀원이 되어 어항을 나갈 수 있습니다.

응답: `{ "ok": true, "ownerId": 2, "removedTasks": 0 }` / 소켓 `tank:owner-changed`

### DELETE /api/tanks/:tankId
어항 삭제 (대표만). 실수 방지를 위해 어항 이름을 그대로 보내야 합니다 (다르면 400 `CONFIRM_MISMATCH`).

```json
{ "confirmName": "클라우드 7팀" }
```
- 멤버, 물고기, 먹이 기록, 채팅, 과제가 함께 지워집니다 (FK ON DELETE CASCADE).
- 각자의 진주와 진주 내역은 남고, 내역의 어항 이름만 비워집니다.

응답: `{ "ok": true }` / 소켓 `tank:deleted` (다른 팀원 화면은 목록으로 이동)

---

## 물고기

### PATCH /api/tanks/:tankId/fish/me
내 물고기 꾸미기. 바꿀 항목만 보내면 됩니다.

```json
{ "name": "뽀글이", "species": "tropical", "color": "mint", "accessory": "crown" }
```
- `accessory`: `ribbon` `hat` `crown` 또는 `null`(벗기). 상점에서 산 것만 (아니면 400 `NOT_OWNED`)

응답: `{ "fish": {...} }` / 소켓 `fish:updated`

### POST /api/tanks/:tankId/fish/:fishId/feed
내 먹이 1개를 이 어항의 물고기(내 것 또는 팀원 것)에게 줍니다.

- 먹이 없음: 400 `NO_FOOD`
- 그 물고기가 오늘 5번 받음: 400 `FEED_LIMIT`
- 받은 먹이 누적이 기준(5, 15, 40)에 닿으면 단계가 오르고, 상태는 바로 `healthy`가 됩니다.

```json
{ "fish": {...}, "food": 4, "leveledUp": true, "prevStage": 1, "wasStatus": "sad" }
```
소켓: `fish:fed`, 성장했다면 `fish:grew`

---

## 지갑, 출석, 상점

### GET /api/me/wallet
```json
{
  "pearls": 160,
  "inventory": { "food": 6, "ribbon": 1, "hat": 0, "crown": 0 },
  "attendance": { "today": "2026-11-17", "checkedToday": true, "streak": 7 }
}
```

### POST /api/me/attendance
하루 첫 접속 출석. 어항 목록과 어항 화면이 열릴 때 부릅니다. 하루에 한 번만 지급 (한국 시간 기준).

- 출석 10진주, 연속 7일째마다 보너스 30진주 (7, 14, 21...일)
- 이미 받았으면 `{ "awarded": false, "streak": 7 }`

```json
{ "awarded": true, "reward": 10, "bonus": 30, "streak": 7, "pearls": 160 }
```
소켓: 내가 들어간 모든 어항에 `attendance`

### GET /api/me/transactions?limit=50
진주 지급/사용 내역 (최신순, 최대 100).

```json
{ "transactions": [ { "id": 5, "amount": -120, "balanceAfter": 40, "type": "buy_accessory", "description": "왕관 구매", "tankName": null, "createdAt": "..." } ] }
```
`type`: `attendance` `streak_bonus` `task_reward` `buy_food` `buy_accessory` `seed`

### GET /api/shop
```json
{ "items": [
  { "item": "food", "label": "먹이", "price": 5, "stackable": true },
  { "item": "ribbon", "label": "리본", "price": 30, "stackable": false },
  { "item": "hat", "label": "모자", "price": 60, "stackable": false },
  { "item": "crown", "label": "왕관", "price": 120, "stackable": false }
] }
```

### POST /api/shop/buy
```json
{ "item": "food", "quantity": 5 }
```
- 먹이는 한 번에 1~20개, 장신구는 1개 (이미 있으면 400 `ALREADY_OWNED`)
- 진주 부족: 400 `NOT_ENOUGH_PEARLS`

응답: `{ "pearls": 35, "inventory": {...} }`

---

## 과제

모두 `/api/tanks/:tankId/tasks` 아래, 어항 참여자만.

| 상태 | 뜻 |
|---|---|
| `todo` | 할 일 |
| `submitted` | 제출됨, 대표 검토 중 |
| `approved` | 승인됨 (진주 지급 완료) |
| `rejected` | 반려됨 (담당자가 다시 제출 가능) |

### GET /api/tanks/:tankId/tasks
```json
{
  "tasks": [ {
    "id": 1, "title": "Apache 리버스 프록시 설정하기", "reward": 60, "dueDate": "2026-11-20",
    "status": "submitted", "assigneeId": 2, "assigneeNickname": "수빈", "creatorId": 1,
    "proofUrl": "https://github.com/...", "memo": "...", "rejectReason": null,
    "submittedAt": "...", "reviewedAt": null, "createdAt": "..."
  } ],
  "pending": 1,
  "today": "2026-11-17"
}
```

### POST /api/tanks/:tankId/tasks (대표만)
```json
{ "title": "발표 자료 만들기", "assigneeId": 2, "reward": 50, "dueDate": "2026-11-20" }
```
- 제목 1~60자, 보상 20~100, 마감일은 오늘 이후
- 담당자는 이 어항 팀원, 대표 본인은 불가 (400 `SELF_ASSIGN`)
- 대표가 아니면 403

### POST /api/tanks/:tankId/tasks/:taskId/submit (담당자만)
```json
{ "proofUrl": "https://github.com/team/repo/pull/3", "memo": "프록시 설정 끝" }
```
`todo` 또는 `rejected`일 때만. 링크는 http(s) 주소, 메모는 선택(500자).

### POST /api/tanks/:tankId/tasks/:taskId/approve (대표만)
`submitted`일 때만. 담당자에게 보상 진주를 지급하고 transactions에 `task_reward`로 기록합니다.

### POST /api/tanks/:tankId/tasks/:taskId/reject (대표만)
```json
{ "reason": "스크린샷도 붙여 주세요" }
```
`submitted`일 때만. 이유는 선택(200자).

---

## 채팅

### GET /api/tanks/:tankId/messages
- 쿼리 없음: 최근 50개 (오래된 것부터)
- `?after=<id>`: 그 id 이후 메시지만 (1단계 폴링용, 최대 100개)

```json
{ "messages": [ { "id": 4, "userId": 1, "nickname": "민규", "body": "안녕하세요", "createdAt": "..." } ] }
```

### POST /api/tanks/:tankId/messages
```json
{ "body": "안녕하세요" }
```
1~300자. 응답 201 `{ "message": {...} }`. 화면에서는 HTML을 이스케이프해서 보여 줍니다.

---

## 관리자 (`ADMIN_ENABLED=true`일 때만)

모두 `/api/admin` 아래, `users.is_admin = 1`인 계정만 (아니면 403, 꺼져 있으면 404).
관리자 계정은 `server/.env`의 `ADMIN_USERNAME`, `ADMIN_PASSWORD`로 `npm run seed` 또는 `npm run admin:create`가 만듭니다.
`GET /api/auth/me`의 `user.isAdmin`으로 관리자인지 알 수 있습니다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/admin/overview` | 사용자 수, 어항 수, 진행 중 과제, 채팅 수, 오늘 준 먹이, 돌고 있는 진주 |
| GET | `/admin/tanks` | 모든 어항과 멤버(아이디, 물고기 단계), 진행 중 과제 수, 채팅 수 |
| PATCH | `/admin/tanks/:id` | `{ name?, ownerId?, newInviteCode? }` 이름, 대표, 초대 코드 바꾸기 (대표가 바뀌면 새 대표의 끝나지 않은 과제는 지워짐) |
| DELETE | `/admin/tanks/:id` | 어항 삭제 (이름 확인 없음). 소켓 `tank:deleted` |
| GET | `/admin/users?q=` | 사용자, 진주, 아이템, 들어간 어항(대표 여부), 마지막 출석. `q`로 아이디/닉네임 검색 |
| POST | `/admin/users/:id/grant` | `{ pearls?, item?, quantity?, reason? }` 진주 지급(음수면 회수, 잔액보다 많이는 불가), 먹이/장신구 지급. 진주 변동은 transactions에 `admin`으로 기록 |
| POST | `/admin/notices` | `{ body, tankId? }` 공지. `tankId`가 없으면 모든 어항. 채팅에 관리자 이름으로 남고 소켓 `notice` |

관리자 관련 소켓 이벤트: `notice` `{ body }`(어항 방), `tank:updated`(어항 방), `wallet:changed` `{ pearls, inventory, item, quantity, pearlsDelta, note }`(개인 방), 관리자 진주 지급은 `wallet:pearls`에 `reason: "admin"`.

---

## 기타

### GET /api/health
`{ "ok": true, "timeScale": 1 }`

---

## Socket.IO 이벤트

- 경로: `/socket.io` (운영에서는 Apache가 Node로 프록시, WebSocket은 `mod_proxy_wstunnel`)
- 인증: 로그인 세션 쿠키를 그대로 씁니다. 로그인 안 된 연결은 `auth:required`를 받고 끊깁니다.
- 방: `tank:<id>` 같은 어항 사람들, `user:<id>` 나 혼자
- 연결이 끊기면 화면은 자동으로 폴링(채팅 2초, 어항 5초)으로 돌아가고, 다시 연결되면 빠진 채팅을 `?after=`로 채웁니다.

### 클라이언트 → 서버

| 이벤트 | 데이터 | 설명 |
|---|---|---|
| `tank:join` | `tankId`, ack `{ ok, error? }` | 어항 방에 들어가기 (참여자인지 확인). 다른 어항 방에서는 나옴 |
| `tank:leave` | 없음 | 어항 방에서 나오기 |

### 서버 → 클라이언트 (어항 방 `tank:<id>`)

| 이벤트 | 데이터 | 화면 |
|---|---|---|
| `chat:message` | `{ id, userId, nickname, body, createdAt }` | 채팅 추가 |
| `member:joined` | `{ userId, nickname }` | "지우님이 어항에 들어왔어요!" |
| `member:left` | `{ userId, nickname, removedTasks }` | "지우님이 어항을 나갔어요." |
| `tank:owner-changed` | `{ fromUserId, fromNickname, toUserId, toNickname, removedTasks }` | "수빈님이 새 대표가 됐어요." (받은 사람에게는 안내) |
| `tank:deleted` | `{ tankName, byUserId, byNickname }` | 목록으로 이동하며 "민규님이 클라우드 7팀 어항을 삭제했어요." |
| `fish:fed` | `{ feederId, feederNickname, fish, wasStatus }` | 먹이가 떨어지고 물고기가 먹음. "민규님이 수빈님의 물고기에게 먹이를 줬어요!" |
| `fish:grew` | `{ feederId, fish, stage, stageName }` | 반짝임 + "수빈님의 물고기가 어른 물고기로 성장했어요!" (내 물고기면 LEVEL UP!) |
| `fish:updated` | `{ fish }` | 꾸미기 반영 |
| `attendance` | `{ userId, nickname, reward, bonus, streak }` | "지우님이 출석해서 10진주를 받았어요!" |
| `task:created` | `{ task }` | 담당자에게 "새 과제가 왔어요" |
| `task:submitted` | `{ task }` | 대표에게 "수빈님이 과제를 제출했어요" |
| `task:approved` | `{ task }` | "수빈님의 과제가 승인됐어요! +60진주" |
| `task:rejected` | `{ task }` | 담당자에게 "과제가 반려됐어요" |

### 서버 → 클라이언트 (개인 방 `user:<id>`)

| 이벤트 | 데이터 | 화면 |
|---|---|---|
| `wallet:pearls` | `{ pearls, amount, reason, taskTitle }` | 과제 승인 진주가 날아와 HUD에 쌓임 |
| `auth:required` | 없음 | 로그인 화면으로 |
