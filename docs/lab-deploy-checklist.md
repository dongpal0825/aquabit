# 실습실 web VM 배포 순서표

대상: Rocky Linux 10 web VM `192.168.163.161` (`www.aquabit.lab`), vCenter 웹 콘솔에서 직접 입력.

- 모든 명령은 `sudo -i`로 root가 된 상태에서 실행합니다 (프롬프트가 `#`).
- 명령 블록에는 한글을 넣지 않았습니다. 콘솔의 "텍스트 보내기"나 직접 입력 모두 그대로 됩니다.
- 비밀번호는 직접 정하지 않고 `openssl rand`로 만들어 `.env`에 넣습니다. 손으로 칠 일이 있는 관리자 비밀번호만 짧은 16자리로 만듭니다.
- 네트워크(IP, DHCP, DNS) 설정은 건드리지 않습니다. 공용 실습망이라 다른 조에 영향이 갈 수 있습니다.

```
브라우저 ─▶ httpd :80 (나중에 :443)
              ├─ /            → /var/www/html (public/)
              ├─ /api/*       → Node 127.0.0.1:3000
              └─ /socket.io/* → Node 127.0.0.1:3000 (WebSocket 포함)
                                   └─▶ MySQL 127.0.0.1:3306
```

---

## 0. 상태 확인

```bash
sudo -i
```

```bash
cat /etc/rocky-release; getenforce; hostname -I
rpm -q httpd mysql8.4-server mysql-server mariadb-server nodejs git rsync
node -v; npm -v
systemctl is-active httpd mysqld mariadb firewalld
```

```bash
ls -la /var/www/html; ls /etc/httpd/conf.d; httpd -S 2>&1 | head -20
firewall-cmd --list-services
ss -tlnp | grep -E ':(80|443|3000|3306) '
```

```bash
curl -sI --max-time 8 https://github.com | head -1
dnf -q repolist
nmcli -f NAME,DEVICE,AUTOCONNECT con show
```

결과 읽기:

| 항목 | 정상 | 아니면 |
|---|---|---|
| `getenforce` | `Enforcing` 또는 `Permissive` | `Disabled`면 SELinux 단계(8-3)는 건너뜀 |
| `rpm -q` | 버전이 붙어 나옴 | `is not installed`면 1단계에서 설치 |
| `node -v` | `v20` 이상 | 1-2 |
| `curl ... github.com` | `HTTP/2 200` 또는 `HTTP/1.1 200` | 1-4 (인터넷 안 됨) |
| `ss` | 80만 httpd, 3000/3306 비어 있음 | 3000을 다른 프로그램이 쓰면 4단계에서 `PORT` 변경 |
| `nmcli` AUTOCONNECT | ens34 줄이 `yes` | `no`면 조교님께 확인 (여기서는 바꾸지 않음) |

---

## 1. 프로그램 설치

### 1-1. 기본 도구

```bash
dnf -y install git rsync openssl
```

### 1-2. Node.js (없거나 v20 미만일 때)

```bash
dnf -y install nodejs npm
node -v
```

`v20` 이상이면 통과. 낮으면 다른 스트림이 있는지 봅니다:

```bash
dnf module list nodejs 2>/dev/null; dnf list --available 'nodejs*' | head -20
```

### 1-3. MySQL (MySQL/MariaDB가 하나도 없을 때)

```bash
dnf -y install mysql8.4-server || dnf -y install mysql-server
```

둘 다 실패하면 실제 패키지 이름을 찾습니다:

```bash
dnf search mysql mariadb 2>/dev/null | grep -iE 'server' 
```

- `mysqlXX-server`가 보이면 그 이름으로 설치, 서비스 이름은 `mysqld`
- MariaDB만 있으면 `dnf -y install mariadb-server`, 서비스 이름은 `mariadb` (앱은 MariaDB에서도 동작)

켜고 자동 시작:

```bash
systemctl enable --now mysqld || systemctl enable --now mariadb
mysql -e "SELECT VERSION();"
```

정상: 버전 숫자 한 줄 (`8.4.x` 또는 `10.11.x-MariaDB`). root로 로그인된 상태라 비밀번호 없이 들어갑니다.
`Access denied`가 나오면 수업에서 root 비밀번호를 정해 둔 것이므로 이후 `mysql` 대신 `mysql -u root -p`를 쓰세요.

### 1-4. 인터넷이 안 될 때

1. 이름 해석이 문제인지 확인합니다. 우리 dns1이 외부 이름을 넘겨주지(포워딩) 않으면 github가 안 풀립니다.

```bash
getent hosts github.com
dig +short github.com @192.168.163.168
dig +short github.com @8.8.8.8
```

- `@8.8.8.8`만 IP가 나오면 dns1의 포워딩/재귀 설정 문제입니다. DNS VM에서 `forwarders { 8.8.8.8; };`와 `recursion yes;`(실습망 대역만 허용)를 확인하세요. web VM의 DNS 설정은 바꾸지 않습니다.
- 둘 다 안 나오면 실습망 자체가 외부로 막혀 있는 것이므로 조교님께 프록시 주소를 물어보세요. 프록시가 있으면:

```bash
export http_proxy=http://PROXY:PORT https_proxy=http://PROXY:PORT
echo "proxy=http://PROXY:PORT" >> /etc/dnf/dnf.conf
npm config set proxy http://PROXY:PORT; npm config set https-proxy http://PROXY:PORT
```

2. 그래도 안 되면 같은 실습망의 Windows PC(인터넷 되는 PC)에서 받아서 넣습니다 (브리지 네트워크라 PC에서 VM으로 scp 가능). Windows PowerShell:

```powershell
git clone https://github.com/dongpal0825/aquabit.git
cd aquabit\server; npm install --omit=dev; cd ..\..
tar -czf aquabit.tgz aquabit
scp aquabit.tgz roo@192.168.163.161:/tmp/
```

VM에서 `tar -xzf /tmp/aquabit.tgz -C /opt` 후 3단계의 `git clone`, `npm install`은 건너뜁니다. (Node, MySQL 패키지 자체가 없으면 Rocky 설치 ISO를 로컬 저장소로 붙여야 하니 조교님께 문의)

---

## 2. 서비스 계정과 코드

```bash
id aquabit || useradd --system --home-dir /opt/aquabit --no-create-home --shell /sbin/nologin aquabit
git clone https://github.com/dongpal0825/aquabit.git /opt/aquabit
cd /opt/aquabit/server
npm install --omit=dev
```

확인:

```bash
git -C /opt/aquabit log --oneline -1
ls /opt/aquabit/server/node_modules | wc -l
```

정상: 최신 커밋 한 줄, 숫자 100 이상. `npm install`에서 `ERR!`가 나오면 1-4.

---

## 3. 설정 파일(.env) 만들기

비밀번호는 모두 새로 생성합니다. 손으로 고칠 필요 없이 아래를 순서대로 붙여 넣습니다.

```bash
cd /opt/aquabit/server
cp .env.example .env
sed -i 's/^NODE_ENV=.*/NODE_ENV=production/; s/^SERVE_STATIC=.*/SERVE_STATIC=false/; s/^HOST=.*/HOST=127.0.0.1/' .env
sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$(openssl rand -hex 32)/" .env
sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$(openssl rand -hex 16)/" .env
sed -i "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=$(openssl rand -hex 8)/" .env
```

확인 (주석 줄은 빼고 봄):

```bash
grep -vE '^#|^$' .env
```

정상:

```
PORT=3000
HOST=127.0.0.1
NODE_ENV=production
SESSION_SECRET=(64자리)
SERVE_STATIC=false
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=aquabit
DB_PASSWORD=(32자리)
DB_NAME=aquabit
TIME_SCALE=1
ADMIN_ENABLED=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=(16자리)
```

- `ADMIN_PASSWORD` 16자리는 관리자 로그인에 쓰니 종이에 적어 두세요. 화면에서 다시 보려면 `grep ADMIN_PASSWORD /opt/aquabit/server/.env`.
- 직접 고칠 때 값 뒤에 `# 설명`을 붙이지 마세요. 주석은 줄 맨 앞 `#`만 씁니다.
- 0단계에서 3000번이 이미 쓰이고 있었다면 `PORT=3001`로 바꾸고, 7단계 Apache 설정의 `3000`도 모두 `3001`로 바꿉니다.

---

## 4. DB와 앱 계정

`.env`의 DB 비밀번호를 그대로 읽어서 만듭니다.

```bash
cd /opt/aquabit/server
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

(root 비밀번호가 있으면 `mysql` 대신 `mysql -u root -p`)

확인:

```bash
mysql -u aquabit -p"$DBPW" -h 127.0.0.1 -e "SELECT CURRENT_USER();" aquabit
```

정상: `aquabit@127.0.0.1` 한 줄 (비밀번호 경고 한 줄은 무시).

---

## 5. 권한, 테이블, 테스트 데이터

```bash
chown -R aquabit:aquabit /opt/aquabit
chmod 600 /opt/aquabit/server/.env
cd /opt/aquabit/server
npm run db:init
npm run seed
```

정상: 오류 없이 끝나고 seed가 test1~3, `admin` 계정을 만들었다고 출력.
`ER_ACCESS_DENIED_ERROR`면 4단계를 다시, `ECONNREFUSED ...3306`이면 MySQL이 꺼져 있음(1-3).

---

## 6. Node를 systemd 서비스로

```bash
cat > /etc/systemd/system/aquabit.service <<'EOF'
[Unit]
Description=AQUABIT API (Node.js)
After=network.target mysqld.service mariadb.service

[Service]
Type=simple
User=aquabit
Group=aquabit
WorkingDirectory=/opt/aquabit/server
ExecStart=/usr/bin/node src/index.js
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
systemctl is-active aquabit
curl -s http://127.0.0.1:3000/api/health; echo
ss -tlnp | grep ':3000 '
```

정상: `active`, `{"ok":true,"timeScale":1}`, `127.0.0.1:3000`에서 node가 LISTEN (`0.0.0.0`이 아님).
`which node` 결과가 `/usr/bin/node`가 아니면 `ExecStart` 경로를 그 결과로 바꿉니다.

---

## 7. 화면 파일과 Apache 프록시

### 7-1. 기존 파일 백업 후 복사

```bash
cp -a /var/www/html /root/html.bak.$(date +%Y%m%d%H%M)
rsync -a --delete /opt/aquabit/public/ /var/www/html/
restorecon -R /var/www/html
ls /var/www/html
```

정상: `index.html login.html tanks.html tank.html admin.html css js`.

### 7-2. 프록시 설정

HTTP(80)와 나중에 붙일 HTTPS(443)가 같은 내용을 쓰도록, 공통 부분을 `aquabit.inc`로 따로 둡니다. (`conf.d`는 `*.conf`만 자동으로 읽으므로 `.inc`는 아래 vhost가 `Include`할 때만 쓰입니다.)

```bash
cat > /etc/httpd/conf.d/aquabit.inc <<'EOF'
DocumentRoot /var/www/html
DirectoryIndex index.html
<Directory /var/www/html>
    Options -Indexes
    AllowOverride None
    Require all granted
</Directory>

ProxyRequests Off
ProxyPreserveHost On
ProxyTimeout 60

RewriteEngine On
RewriteCond %{HTTP:Upgrade} =websocket [NC]
RewriteRule ^/socket\.io/(.*) ws://127.0.0.1:3000/socket.io/$1 [P,L]
ProxyPass        /socket.io/ http://127.0.0.1:3000/socket.io/
ProxyPassReverse /socket.io/ http://127.0.0.1:3000/socket.io/

ProxyPass        /api/ http://127.0.0.1:3000/api/
ProxyPassReverse /api/ http://127.0.0.1:3000/api/
EOF
```

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

0단계 `ls /etc/httpd/conf.d`에 지난 실습에서 만든 다른 `*.conf` vhost(80번)가 있었다면, 그 파일 이름을 `.conf.off`로 바꿔 두세요 (`mv 파일.conf 파일.conf.off`). 같은 80번에 vhost가 여러 개면 IP로 접속할 때 엉뚱한 쪽이 열릴 수 있습니다.

### 7-3. SELinux와 적용

```bash
setsebool -P httpd_can_network_connect 1
getsebool httpd_can_network_connect
httpd -M 2>/dev/null | grep -E 'proxy_module|proxy_http|proxy_wstunnel|rewrite|headers'
apachectl configtest
```

정상: `--> on`, 모듈 5개(`proxy_module`, `proxy_http_module`, `proxy_wstunnel_module`, `rewrite_module`, `headers_module`), `Syntax OK`.
(`getenforce`가 `Disabled`면 `setsebool`은 오류가 나도 무시)

```bash
systemctl reload httpd
```

### 7-4. VM 안에서 확인

```bash
curl -s http://127.0.0.1/api/health; echo
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: www.aquabit.lab' http://127.0.0.1/
curl -s 'http://127.0.0.1/socket.io/?EIO=4&transport=polling' | head -c 60; echo
curl -s -i -N --max-time 3 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' 'http://127.0.0.1/socket.io/?EIO=4&transport=websocket' | head -1
```

정상 순서대로:
1. `{"ok":true,"timeScale":1}` (503이면 7-3 `setsebool` 또는 6단계 서비스)
2. `200`
3. `0{"sid":"...` (Socket.IO 폴링)
4. `HTTP/1.1 101 Switching Protocols` (WebSocket 프록시)

---

## 8. 방화벽

```bash
systemctl is-active firewalld && firewall-cmd --permanent --add-service=http && firewall-cmd --reload
firewall-cmd --list-services
```

정상: 목록에 `http`. 3000, 3306은 열지 않습니다. (`inactive`면 방화벽이 꺼져 있는 것이고 그대로 둡니다)

---

## 9. 다른 PC에서 확인

1. 실습실 PC의 DNS를 dns1(`192.168.163.168`)로 지정했는지 확인하고 `nslookup www.aquabit.lab` → `192.168.163.161`
2. 브라우저에서 `http://www.aquabit.lab` (DNS가 안 되면 `http://192.168.163.161`)
3. `test1` / `aquabit123` 로그인 → 출석 팝업
4. 다른 PC나 시크릿 창에서 `test2` / `aquabit123` → 같은 어항 채팅이 서로 바로 보이면 WebSocket까지 정상
5. `admin` / 3단계의 16자리 → 관리자 화면

---

## 10. 문제가 생겼을 때

```bash
systemctl status aquabit --no-pager -l | head -20
journalctl -u aquabit -n 50 --no-pager
```

```bash
tail -n 30 /var/log/httpd/aquabit_error.log
tail -n 10 /var/log/httpd/aquabit_access.log
```

```bash
ausearch -m avc -ts recent 2>/dev/null | tail -20
journalctl -t setroubleshoot -n 20 --no-pager 2>/dev/null
```

| 증상 | 원인과 해결 |
|---|---|
| 화면은 뜨는데 로그인/가입이 안 됨, `/api` 503 | `systemctl is-active aquabit`, `getsebool httpd_can_network_connect`가 `on`인지 |
| `aquabit_error.log`에 `Permission denied: AH00957` | SELinux. 7-3 `setsebool` |
| `journalctl`에 `ER_ACCESS_DENIED_ERROR` | `.env` DB 비밀번호와 MySQL 계정 불일치. 4단계 다시 |
| `journalctl`에 `ECONNREFUSED 127.0.0.1:3306` | MySQL 꺼짐. `systemctl start mysqld` (또는 `mariadb`) |
| `journalctl`에 `EADDRINUSE` | 3000번 사용 중. `.env`의 `PORT`와 `aquabit.inc`의 3000을 함께 변경 |
| `journalctl`에 `SESSION_SECRET이 비어 있어요` | 3단계 `sed` 다시 |
| 채팅이 2~5초 늦게 옴 | WebSocket 프록시 실패 후 폴링으로 동작 중. 7-4의 4번째 명령 결과, `proxy_wstunnel_module` 확인 |
| 관리자 로그인이 안 됨 | `grep -E 'ADMIN' .env`에 줄 끝 주석이 없는지 확인 후 `npm run admin:create`, `systemctl restart aquabit` |
| 다른 PC에서 이름으로 안 열림 | 그 PC의 DNS가 dns1인지, dns1에 `www.aquabit.lab` A 레코드가 있는지 |
| IP로 열면 다른 페이지가 나옴 | 다른 80번 vhost가 먼저 잡힘. `httpd -S`로 확인 후 7-2의 `.conf.off` |

---

## 11. 코드 업데이트

```bash
cd /opt/aquabit && sudo -u aquabit git pull
cd server && sudo -u aquabit npm install --omit=dev
rsync -a --delete /opt/aquabit/public/ /var/www/html/ && restorecon -R /var/www/html
systemctl restart aquabit
```

데이터를 처음 상태로: `cd /opt/aquabit/server && systemctl stop aquabit && npm run db:init && npm run seed && systemctl start aquabit` (모든 데이터와 로그인 세션이 지워집니다)

---

## 12. 나중에: HTTPS(사설 인증서)와 wss

위 구조라면 443 vhost를 하나 더 만들고 같은 `aquabit.inc`를 `Include`하면 됩니다. 앱은 `X-Forwarded-Proto: https`를 보고 로그인 쿠키에 `Secure`를 자동으로 붙이고, 브라우저의 Socket.IO는 페이지가 https면 알아서 `wss://`로 붙습니다. Apache가 TLS를 풀고 Node에는 지금처럼 `ws://127.0.0.1:3000`으로 넘기므로 `aquabit.inc`는 바꿀 필요가 없습니다.

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

https가 잘 되면 80번 vhost의 `Include conf.d/aquabit.inc` 줄을 `Redirect permanent / https://www.aquabit.lab/`로 바꿔 http를 https로 넘깁니다. 사설 인증서라 브라우저에 경고가 뜨는데, 시연 PC에 `aquabit.crt`를 신뢰할 수 있는 루트 인증서로 넣으면 사라집니다. 우리 조 CA로 서명한 인증서를 쓸 거라면 `SSLCertificateFile`/`SSLCertificateKeyFile` 경로만 바꾸면 됩니다.
