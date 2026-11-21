# Rocky Linux 10 VM 배포 (구성 설명)

실습실 web VM에 실제로 올릴 때는 단계별 순서표 [lab-deploy-checklist.md](lab-deploy-checklist.md)를 따라 하세요. 이 문서는 구성과 설정 파일의 의미를 설명합니다.

## 구성

```
브라우저 ─▶ Apache httpd :80 ─▶ Node(Express) 127.0.0.1:3001 ─▶ MySQL 127.0.0.1:3306
```

- **Node 하나**가 회사 홈페이지(EJS), 팀 어항 화면(`/community/`), 게임 빌드 결과(`/play/`), 게임 API(`/api/game/`), 실시간(`/game-socket.io/`)을 모두 처리합니다.
- **Apache**는 앞단에서 모든 요청을 Node로 넘깁니다 (`ProxyPass /`). 정적 파일을 `/var/www/html`에 따로 두지 않습니다.
- WebSocket은 `ProxyPass`만으로는 넘어가지 않으므로 `/game-socket.io/` 업그레이드 요청을 `ws://`로 보내는 Rewrite 규칙을 따로 둡니다 (`mod_proxy_wstunnel`).
- Node는 `HOST=127.0.0.1`로 VM 안에서만 접속을 받습니다. 방화벽은 80(나중에 443)만 열고 3001, 3306은 열지 않습니다.

## 빌드가 필요한 이유

게임 화면은 Vue 3 + PixiJS로 만들어져 있어서, 브라우저가 읽을 수 있는 JS로 변환(빌드)해야 합니다.

```
game/ (Vue 원본)  ──npm run build (Vite)──▶  public/play/ (브라우저용)
```

- `public/play/`는 git에 올리지 않습니다. 서버에서 `npm ci`(빌드 도구 포함) 후 `npm run build`로 만듭니다.
- `npm start`는 빌드 후 실행하지만, systemd 서비스는 `node server.js`를 직접 실행합니다 (켤 때마다 빌드하지 않음). 코드를 받은 뒤에는 `npm run build`를 한 번 실행하세요.

## 설정 파일

| 파일 | 내용 |
|---|---|
| `/opt/aquabit/.env` | 포트, DB, 세션 키, 관리자, 메일 설정 ([README](../README.md#환경-변수-env)) |
| `/etc/systemd/system/aquabit.service` | `WorkingDirectory=/opt/aquabit`, `ExecStart=/usr/bin/node server.js`, `User=aquabit` |
| `/etc/httpd/conf.d/aquabit.inc` | 프록시 공통 설정 (WebSocket 규칙 + `ProxyPass /`). 80과 443 vhost가 같이 Include |
| `/etc/httpd/conf.d/aquabit.conf` | 80번 vhost (`www.aquabit.lab`) |

`aquabit.inc` 핵심:

```apache
RewriteEngine On
RewriteCond %{HTTP:Upgrade} =websocket [NC]
RewriteRule ^/game-socket\.io/(.*) ws://127.0.0.1:3001/game-socket.io/$1 [P,L]
ProxyPass        / http://127.0.0.1:3001/
ProxyPassReverse / http://127.0.0.1:3001/
```

SELinux는 Apache가 다른 포트로 접속하는 것을 막으므로 `setsebool -P httpd_can_network_connect 1`이 필요합니다 (빠뜨리면 503).

## DB 명령

| 명령 | 언제 |
|---|---|
| `npm run db:init` | 처음 설치, 또는 데이터를 처음 상태로 (게임 데이터 삭제) |
| `npm run seed` | `db:init` 뒤 테스트 계정·어항 |
| `npm run db:migrate` | 코드 업데이트 후, 데이터를 지우지 않고 테이블만 맞춤 |
| `npm run admin:create` | `.env`의 관리자 계정 만들기·비밀번호 다시 맞추기 |

## 업데이트 순서

```bash
cd /opt/aquabit && sudo -u aquabit git pull
sudo -u aquabit npm ci && sudo -u aquabit npm run build
sudo -u aquabit npm run db:migrate
sudo systemctl restart aquabit
```
