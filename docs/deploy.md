# Rocky Linux 10 VM 배포

구성: 한 VM 안에서

```
브라우저 ──▶ Apache httpd :80
              ├─ /            → /var/www/html (public/ 정적 파일)
              ├─ /api/*       → Node(Express) 127.0.0.1:3000
              └─ /socket.io/* → Node 127.0.0.1:3000 (WebSocket은 mod_proxy_wstunnel)
                                   └─▶ MySQL 127.0.0.1:3306
```

아래 명령은 `sudo` 권한이 있는 사용자 기준입니다. 경로 예시는 코드를 `/opt/aquabit`에 둔다고 가정합니다.

## 1. 패키지 설치

```bash
sudo dnf -y update
sudo dnf -y install httpd mysql-server git
# Node.js 20 이상 (AppStream 모듈 또는 NodeSource)
sudo dnf -y install nodejs npm
node -v
```

> Rocky 10 AppStream의 기본 Node 버전이 18 미만이면 `sudo dnf module list nodejs`로 스트림을 확인하고 20 이상을 설치하세요.

## 2. MySQL 설정

```bash
sudo systemctl enable --now mysqld
sudo mysql_secure_installation      # root 비밀번호 설정, 익명 사용자/원격 root 제거
```

DB와 앱 전용 계정을 만듭니다. 비밀번호는 바꾸세요.

```bash
sudo mysql -u root -p <<'SQL'
CREATE DATABASE IF NOT EXISTS aquabit DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'aquabit'@'localhost' IDENTIFIED BY '긴-비밀번호';
CREATE USER IF NOT EXISTS 'aquabit'@'127.0.0.1' IDENTIFIED BY '긴-비밀번호';
GRANT ALL PRIVILEGES ON aquabit.* TO 'aquabit'@'localhost';
GRANT ALL PRIVILEGES ON aquabit.* TO 'aquabit'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
```

MySQL은 같은 VM의 Node만 접속하므로 3306 포트는 방화벽에서 열지 않습니다.

## 3. 코드 배치와 서버 설정

```bash
sudo useradd --system --home /opt/aquabit --shell /sbin/nologin aquabit
sudo git clone <저장소 주소> /opt/aquabit       # 또는 scp로 복사
cd /opt/aquabit/server
sudo npm ci --omit=dev || sudo npm install --omit=dev
sudo cp .env.example .env
sudo vi .env
```

`.env` 운영 값 예시:

```ini
PORT=3000
NODE_ENV=production
SESSION_SECRET=<openssl rand -hex 32 결과>
SERVE_STATIC=false
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=aquabit
DB_PASSWORD=긴-비밀번호
DB_NAME=aquabit
TIME_SCALE=1
ADMIN_ENABLED=true          # 관리자 기능이 필요 없으면 false
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<긴 무작위 비밀번호>   # 인터넷에 열린 서버에서는 예시 비밀번호 금지
```

테이블을 만들고 (필요하면) 테스트 데이터를 넣습니다.

```bash
sudo -u aquabit npm run db:init
sudo -u aquabit npm run seed        # 시연용 테스트 계정이 필요할 때만 (관리자 계정도 같이 만듦)
sudo -u aquabit npm run admin:create   # seed 없이 관리자 계정만 만들 때
sudo chown -R aquabit:aquabit /opt/aquabit
sudo chmod 600 /opt/aquabit/server/.env
```

## 4. 정적 파일 배치

```bash
sudo rsync -a --delete /opt/aquabit/public/ /var/www/html/
sudo restorecon -Rv /var/www/html
```

코드를 고친 뒤에는 이 명령을 다시 실행하면 됩니다.

## 5. Node를 systemd 서비스로 등록

`/etc/systemd/system/aquabit.service`:

```ini
[Unit]
Description=AQUABIT API (Node.js)
After=network.target mysqld.service
Requires=mysqld.service

[Service]
Type=simple
User=aquabit
Group=aquabit
WorkingDirectory=/opt/aquabit/server
EnvironmentFile=/opt/aquabit/server/.env
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=3
# 보안 옵션
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now aquabit
sudo systemctl status aquabit
journalctl -u aquabit -f            # 로그 보기
curl http://127.0.0.1:3000/api/health
```

## 6. Apache 리버스 프록시

필요한 모듈(`mod_proxy`, `mod_proxy_http`, `mod_proxy_wstunnel`, `mod_rewrite`)은 Rocky의 httpd 패키지에 포함되어 기본으로 켜져 있습니다. 확인:

```bash
httpd -M | grep -E 'proxy_module|proxy_http|proxy_wstunnel|rewrite'
```

`/etc/httpd/conf.d/aquabit.conf`:

```apache
<VirtualHost *:80>
    ServerName aquabit.example.com
    DocumentRoot /var/www/html

    <Directory /var/www/html>
        Options -Indexes
        AllowOverride None
        Require all granted
    </Directory>

    DirectoryIndex index.html

    ProxyPreserveHost On
    ProxyRequests Off
    RequestHeader set X-Forwarded-Proto "http"

    # Socket.IO: WebSocket 업그레이드 요청은 ws://로, 나머지(폴링)는 http://로
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule ^/socket\.io/(.*) ws://127.0.0.1:3000/socket.io/$1 [P,L]
    ProxyPass        /socket.io/ http://127.0.0.1:3000/socket.io/
    ProxyPassReverse /socket.io/ http://127.0.0.1:3000/socket.io/

    # API
    ProxyPass        /api/ http://127.0.0.1:3000/api/
    ProxyPassReverse /api/ http://127.0.0.1:3000/api/

    ErrorLog  /var/log/httpd/aquabit_error.log
    CustomLog /var/log/httpd/aquabit_access.log combined
</VirtualHost>
```

> `mod_proxy_wstunnel` 대신 Apache 2.4.47 이상의 `ProxyPass ... upgrade=websocket` 옵션을 써도 됩니다:
> `ProxyPass /socket.io/ http://127.0.0.1:3000/socket.io/ upgrade=websocket`

SELinux가 Apache의 외부 연결(프록시)을 막지 않도록 허용하고, 설정을 확인한 뒤 시작합니다.

```bash
sudo setsebool -P httpd_can_network_connect 1
sudo apachectl configtest
sudo systemctl enable --now httpd
```

## 7. 방화벽

```bash
sudo firewall-cmd --permanent --add-service=http
# HTTPS를 쓰면: sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

3000(Node), 3306(MySQL)은 열지 않습니다. 외부에서는 Apache 80/443으로만 들어옵니다.

## 8. 확인

```bash
curl -i http://<VM-IP>/api/health          # {"ok":true,...}
curl -I http://<VM-IP>/                    # 200, index.html
```

브라우저에서 `http://<VM-IP>/`를 열어 회원가입, 어항 만들기, 채팅을 확인합니다.

## 업데이트 순서

```bash
cd /opt/aquabit && sudo -u aquabit git pull
cd server && sudo -u aquabit npm install --omit=dev
sudo rsync -a --delete /opt/aquabit/public/ /var/www/html/ && sudo restorecon -Rv /var/www/html
sudo systemctl restart aquabit
```

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| `/api` 요청이 503 | `systemctl status aquabit`, `setsebool httpd_can_network_connect` |
| 로그인이 바로 풀림 | `.env`의 `SESSION_SECRET`이 재시작마다 바뀌지 않는지, 쿠키가 막히지 않는지 |
| 실시간 알림이 안 옴 (4단계 이후) | `httpd -M`에 `proxy_wstunnel_module`, Rewrite 규칙, 브라우저 개발자 도구 Network의 WS 연결 |
| 정적 파일 403 | `restorecon -Rv /var/www/html`, 파일 권한 |
| DB 접속 실패 | `.env`의 DB 값, `mysql -u aquabit -p -h 127.0.0.1 aquabit` |
