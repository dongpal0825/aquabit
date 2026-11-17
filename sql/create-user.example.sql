-- 로컬/서버용 DB와 계정 만들기 (root로 한 번 실행)
-- 1) 이 파일을 create-user.local.sql 로 복사하고 비밀번호를 바꾼다 (*.local.sql 은 git에 올라가지 않음)
-- 2) mysql -u root -p < sql/create-user.local.sql
--    Windows PowerShell: & 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' -u root -p -e "source sql/create-user.local.sql"
-- 3) server/.env 의 DB_PASSWORD 를 같은 값으로 맞춘다
CREATE DATABASE IF NOT EXISTS aquabit DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'aquabit'@'localhost' IDENTIFIED BY 'change-me';
CREATE USER IF NOT EXISTS 'aquabit'@'127.0.0.1' IDENTIFIED BY 'change-me';
GRANT ALL PRIVILEGES ON aquabit.* TO 'aquabit'@'localhost';
GRANT ALL PRIVILEGES ON aquabit.* TO 'aquabit'@'127.0.0.1';
FLUSH PRIVILEGES;
