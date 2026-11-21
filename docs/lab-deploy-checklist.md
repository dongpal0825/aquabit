# 실습실 web VM 배포 순서표 (통합 버전)

대상: Rocky Linux 10 web VM `192.168.163.161` (`www.aquabit.lab`), vCenter 웹 콘솔에서 직접 입력.

- 모든 명령은 `sudo -i`로 root가 된 상태에서 실행합니다 (프롬프트가 `#`).
- 명령 블록에는 한글을 넣지 않았습니다. 콘솔의 "텍스트 보내기"나 직접 입력 모두 그대로 됩니다.
- 비밀번호는 직접 정하지 않고 `openssl rand`로 만들어 `.env`에 넣습니다. 손으로 칠 일이 있는 관리자 비밀번호만 짧은 16자리로 만듭니다.
- 네트워크(IP, DHCP, DNS) 설정은 건드리지 않습니다. 공용 실습망이라 다른 조에 영향이 갈 수 있습니다.

```
브라우저 ─▶ httpd :80 (나중에 :443) ─▶ 전부 Node 127.0.0.1:3001 ─▶ MySQL 127.0.0.1:3306
                                         ├─ /                 회사 홈페이지
                                         ├─ /community/       팀 어항 화면
                                         ├─ /play/            게임 빌드 결과
                                         ├─ /api/game/        게임 API
                                         └─ /game-socket.io/  실시간 (WebSocket 규칙 필요)
```

이전 버전과 달라진 점: Node 포트 3000 → **3001**, 화면 파일을 `/var/www/html`로 복사하지 않음 (Apache는 전부 Node로 전달), 설치 후 **`npm run build`**(게임 빌드) 추가, 실시간 경로 `/socket.io` → **`/game-socket.io`**.

---

## 0. 상태 확인

```bash
sudo -i
```

```bash
cat /etc/rocky-release; getenforce; hostname -I
rpm -q httpd mysql8.4-server mysql-server mariadb-server nodejs git
node -v; npm -v
systemctl is-active httpd mysqld mariadb firewalld
```

```bash
ls /etc/httpd/conf.d; httpd -S 2>&1 | head -20
firewall-cmd --list-services
ss -tlnp | grep -E ':(80|443|3001|3306) '
```

```bash
curl -sI --max-time 8 https://github.com | head -1
getent hosts github.com registry.npmjs.org
```

| 항목 | 정상 | 아니면 |
|---|---|---|
| `getenforce` | `Enforcing` 또는 `Permissive` | `Disabled`면 6-3의 `setsebool`은 건너뜀 |
| `rpm -q` | 버전이 붙어 나옴 | `is not installed`면 1단계에서 설치 |
| `node -v` | **`v22.12` 이상** | 1-2 |
| `curl ... github.com` | `200` | 1-4 (인터넷 안 됨) |
| `ss` | 3001, 3306이 비어 있음 | 3001을 다른 프로그램이 쓰면 3단계에서 `PORT` 변경 |

---

## 1. 프로그램 설치

### 1-1. 기본 도구

```bash
dnf -y install git openssl
```

### 1-2. Node.js (없거나 v22.12 미만일 때)

```bash
dnf -y install nodejs npm
node -v
```

`v22.12` 이상이면 통과. 낮으면 다른 스트림을 찾습니다:

```bash
dnf module list nodejs 2>/dev/null; dnf list --available 'nodejs*' | head -20
```

### 1-3. MySQL (MySQL/MariaDB가 하나도 없을 때)

```bash
dnf -y install mysql8.4-server || dnf -y install mysql-server
systemctl enable --now mysqld || systemctl enable --now mariadb
mysql -e "SELECT VERSION();"
```

정상: 버전 한 줄. `Access denied`면 수업에서 root 비밀번호를 정한 것이므로 이후 `mysql` 대신 `mysql -u root -p`를 씁니다.

### 1-4. 인터넷이 안 될 때

```bash
dig +short github.com @192.168.163.168
dig +short github.com @8.8.8.8
```

- `@8.8.8.8`만 IP가 나오면 dns1의 포워딩/재귀 설정 문제입니다 (DNS VM에서 `forwarders`, `recursion` 확인). web VM의 DNS 설정은 바꾸지 않습니다.
- 둘 다 안 되면 조교님께 프록시 주소를 물어봅니다.
- 그래도 안 되면 인터넷이 되는 실습실 Windows PC에서 `git clone` → `npm ci` → `npm run build` 후 폴더를 압축해 `scp`로 VM의 `/opt/`에 풀고, 2단계의 clone·설치·빌드를 건너뜁니다.

---

## 2. 코드 받기, 설치, 게임 빌드

```bash
id aquabit || useradd --system --home-dir /opt/aquabit --no-create-home --shell /sbin/nologin aquabit
git clone https://github.com/dongpal0825/aquabit.git /opt/aquabit
cd /opt/aquabit
npm ci
npm run build
```

- 게임 빌드 도구(Vite)가 필요해서 `--omit=dev` 없이 `npm ci`로 전부 설치합니다.
- 확인: `ls public/play` → `assets community-entry.js index.html ...`

---

## 3. 설정 파일(.env)

```bash
cd /opt/aquabit
cp .env.example .env
sed -i 's/^NODE_ENV=.*/NODE_ENV=production/; s/^GAME_DATABASE_ENABLED=.*/GAME_DATABASE_ENABLED=true/' .env
sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$(openssl rand -hex 32)/" .env
sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$(openssl rand -hex 16)/" .env
sed -i "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=$(openssl rand -hex 8)/" .env
grep -E '^(HOST|PORT|NODE_ENV|GAME_DATABASE_ENABLED|DB_USER|DB_NAME|ADMIN_USERNAME)=' .env
grep ADMIN_PASSWORD .env
```

정상: `HOST=127.0.0.1`, `PORT=3001`, `NODE_ENV=production`, `GAME_DATABASE_ENABLED=true`, `DB_USER=aquabit`, `DB_NAME=aquabit`, `ADMIN_USERNAME=admin`. 마지막 줄의 16자리는 관리자 로그인 비밀번호이니 종이에 적어 두세요.

사내 메일까지 쓰려면 메일 담당 팀원의 값으로 `WEBMAIL_HOST=192.168.163.162`, `WEBMAIL_DOMAIN=aquabit.lab`, `SMTP_USER`, `SMTP_PASS`를 채웁니다 (`vi .env`). 값 뒤에 `# 설명`은 붙이지 않습니다.

---

## 4. DB와 앱 계정, 테이블, 테스트 데이터

```bash
cd /opt/aquabit
DBPW=$(grep '^DB_PASSWORD=' .env | cut -d= -f2)
mysql <<SQL
CREATE DATABASE IF NOT EXISTS aquabit DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'aquabit'@'localhost' IDENTIFIED BY '$DBPW';
CREATE USER IF NOT EXISTS 'aquabit'@'127.0.0.1' IDENTIFIED BY '$DBPW';
ALTER USER 'aquabit'@'localhost' IDENTIFIED BY '$DBPW';
ALTER USER 'aquabit'@'127.0.0.1' IDENTIFIED BY '$DBPW';
GRANT ALL PRIVILEGES ON aquabit.* TO 'aquabit'@'localhost';
GRANT ALL PRIVILEGES ON aquabit.* TO 'aquabit'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
```

```bash
chown -R aquabit:aquabit /opt/aquabit
chmod 600 /opt/aquabit/.env
npm run db:init
npm run seed
```

정상: `게임 테이블을 새로 만들었어요`, `시드 완료`와 test1~3, admin 안내. `ER_ACCESS_DENIED_ERROR`면 위 DB 블록을 다시 실행합니다.

데이터를 지우지 않고 테이블만 맞출 때(코드 업데이트 후)는 `npm run db:migrate`.

---

## 5. Node를 systemd 서비스로

```bash
cat > /etc/systemd/system/aquabit.service <<'EOF'
[Unit]
Description=AQUABIT (homepage + Pixel Aquarium, Node.js)
After=network-online.target mysqld.service mariadb.service
Wants=network-online.target

[Service]
Type=simple
User=aquabit
Group=aquabit
WorkingDirectory=/opt/aquabit
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
```

```bash
systemctl daemon-reload
systemctl enable --now aquabit
sleep 2; systemctl is-active aquabit
curl -s http://127.0.0.1:3001/api/game/health; echo
ss -tlnp | grep ':3001 '
```

정상: `active`, `{"ok":true,"databaseEnabled":true}`, `127.0.0.1:3001`에서 node가 LISTEN.
`ExecStart`는 `node server.js`를 직접 실행하므로 서비스가 켜질 때마다 빌드하지 않습니다 (빌드는 2단계·업데이트 때 `npm run build`).

---

## 6. Apache 프록시

### 6-1. 공통 설정 (나중에 HTTPS 443에서도 그대로 Include)

```bash
cat > /etc/httpd/conf.d/aquabit.inc <<'EOF'
ProxyRequests Off
ProxyPreserveHost On
ProxyTimeout 60

RewriteEngine On
RewriteCond %{HTTP:Upgrade} =websocket [NC]
RewriteRule ^/game-socket\.io/(.*) ws://127.0.0.1:3001/game-socket.io/$1 [P,L]

ProxyPass        / http://127.0.0.1:3001/
ProxyPassReverse / http://127.0.0.1:3001/
EOF
```

### 6-2. 80번 VirtualHost

```bash
cat > /etc/httpd/conf.d/aquabit.conf <<'EOF'
<VirtualHost *:80>
    ServerName www.aquabit.lab
    ServerAlias aquabit.lab 192.168.163.161
    RequestHeader set X-Forwarded-Proto "http"
    Include conf.d/aquabit.inc
    ErrorLog  /var/log/httpd/aquabit_error.log
    CustomLog /var/log/httpd/aquabit_access.log combined
</VirtualHost>
EOF
```

이전 버전에서 만든 `aquabit.conf`/`aquabit.inc`는 위 명령이 덮어씁니다. 다른 80번 vhost(`ls /etc/httpd/conf.d`)가 있으면 `.conf.off`로 이름을 바꿔 둡니다.

### 6-3. SELinux와 적용

```bash
setsebool -P httpd_can_network_connect 1
httpd -M 2>/dev/null | grep -E 'proxy_module|proxy_http|proxy_wstunnel|rewrite|headers'
apachectl configtest && systemctl enable --now httpd && systemctl reload httpd
```

정상: 모듈 5개, `Syntax OK`.

### 6-4. VM 안에서 확인

```bash
curl -s http://127.0.0.1/api/game/health; echo
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: www.aquabit.lab' http://127.0.0.1/
curl -s 'http://127.0.0.1/game-socket.io/?EIO=4&transport=polling' | head -c 60; echo
curl -s -i -N --max-time 3 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' 'http://127.0.0.1/game-socket.io/?EIO=4&transport=websocket' | head -1
```

정상 순서대로: `{"ok":true,"databaseEnabled":true}`, `200`, `0{"sid":"...`, `HTTP/1.1 101 Switching Protocols`.

---

## 7. 방화벽

```bash
systemctl is-active firewalld && firewall-cmd --permanent --add-service=http && firewall-cmd --reload
firewall-cmd --list-services
```

3001, 3306은 열지 않습니다.

---

## 8. 다른 PC에서 확인

1. 실습실 PC의 DNS가 dns1(`192.168.163.168`)인지 확인하고 `http://www.aquabit.lab` (안 되면 `http://192.168.163.161`)
2. 회사 홈페이지 → **게임 시작** → `test1` / `aquabit123` 로그인 → 출석 팝업
3. 다른 PC나 시크릿 창에서 `test2` / `aquabit123` → 같은 어항 채팅이 바로 보이면 WebSocket까지 정상
4. 먹이 주기에서 팀원 물고기를 골라 먹이를 주면 그 물고기가 먹으러 감
5. `admin` / 3단계의 16자리 → 관리자 화면

---

## 9. 문제가 생겼을 때

```bash
systemctl status aquabit --no-pager -l | head -20
journalctl -u aquabit -n 50 --no-pager
tail -n 30 /var/log/httpd/aquabit_error.log
ausearch -m avc -ts recent 2>/dev/null | tail -20
```

| 증상 | 원인과 해결 |
|---|---|
| 503, 화면이 아예 안 뜸 | `systemctl is-active aquabit`, `getsebool httpd_can_network_connect` |
| 로그인에서 "계정 저장은 MySQL 설정 후..." | `.env`의 `GAME_DATABASE_ENABLED=true` 확인 후 `systemctl restart aquabit` |
| 로그인에서 "게임 저장소를 사용할 수 없어요" | DB 접속 실패. `journalctl`의 오류 코드, 4단계 다시 |
| 게임 화면이 비어 있음, `/play/...` 404 | `npm run build`를 안 함. `cd /opt/aquabit && sudo -u aquabit npm run build` |
| 채팅이 2~5초 늦게 옴 | WebSocket 전달 실패 후 폴링 동작 중. 6-4의 4번째 명령, `proxy_wstunnel_module` 확인 |
| `journalctl`에 `EADDRINUSE` | 3001 사용 중. `.env`의 `PORT`와 `aquabit.inc`의 3001을 함께 변경 |
| 관리자 로그인이 안 됨 | `npm run admin:create` 후 `systemctl restart aquabit` |

---

## 10. 코드 업데이트

```bash
cd /opt/aquabit && sudo -u aquabit git pull
sudo -u aquabit npm ci
sudo -u aquabit npm run build
sudo -u aquabit npm run db:migrate
systemctl restart aquabit
```

데이터를 처음 상태로: `systemctl stop aquabit && npm run db:init && npm run seed && systemctl start aquabit` (게임 데이터와 로그인이 모두 지워짐)

---

## 11. 나중에: HTTPS(사설 인증서)와 wss

443 vhost를 하나 더 만들고 같은 `aquabit.inc`를 `Include`하면 됩니다. 앱은 `X-Forwarded-Proto: https`를 보고 로그인 쿠키에 `Secure`를 붙이고, 브라우저의 Socket.IO는 페이지가 https면 `wss://`로 붙습니다. Apache가 TLS를 풀고 Node에는 `ws://127.0.0.1:3001`로 넘기므로 `aquabit.inc`는 바꾸지 않습니다.

```bash
dnf -y install mod_ssl
mkdir -p /etc/pki/aquabit
openssl req -x509 -nodes -newkey rsa:2048 -days 365 -keyout /etc/pki/aquabit/aquabit.key -out /etc/pki/aquabit/aquabit.crt -subj "/CN=www.aquabit.lab" -addext "subjectAltName=DNS:www.aquabit.lab,DNS:aquabit.lab,IP:192.168.163.161"
chmod 600 /etc/pki/aquabit/aquabit.key
restorecon -R /etc/pki/aquabit
```

```bash
cat > /etc/httpd/conf.d/aquabit-ssl.conf <<'EOF'
<VirtualHost *:443>
    ServerName www.aquabit.lab
    ServerAlias aquabit.lab 192.168.163.161
    SSLEngine on
    SSLCertificateFile    /etc/pki/aquabit/aquabit.crt
    SSLCertificateKeyFile /etc/pki/aquabit/aquabit.key
    RequestHeader set X-Forwarded-Proto "https"
    Include conf.d/aquabit.inc
    ErrorLog  /var/log/httpd/aquabit_ssl_error.log
    CustomLog /var/log/httpd/aquabit_ssl_access.log combined
</VirtualHost>
EOF
apachectl configtest && systemctl reload httpd
firewall-cmd --permanent --add-service=https && firewall-cmd --reload
```

회사 홈페이지의 보안 헤더는 HTTP 기준(HSTS 끔, `upgrade-insecure-requests` 끔)이라, HTTPS로 완전히 옮길 때는 `app.js`의 helmet 설정도 함께 바꿉니다.
