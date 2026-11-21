가상 게임 회사 "AQUABIT"의 회사 홈페이지를 만들어줘.
대학교 클라우드 컴퓨팅 수업 팀 프로젝트용이고, 실제 회사가 아닌 가상 회사야.
넥슨과 메이플스토리처럼, 회사 홈페이지(www)와 게임 서비스(game)를 나누는 구조야.
이번에 만드는 건 회사 홈페이지만이고, 게임 서비스는 다른 팀원이 이미 만들었어.

[회사/서비스]
- 회사: AQUABIT (팀 프로젝트용 가상 게임 회사)
- 대표 서비스: Pixel Aquarium - 팀 프로젝트 팀을 위한 픽셀 아트 아쿠아리움 커뮤니티
  · 팀 어항을 만들고 초대 코드로 팀원 참여
  · 물고기 꾸미기(종류, 색, 장신구)와 키우기(먹이, 성장)
  · 어항별 채팅(몇 초 간격으로 갱신, 실시간 아님), 물고기 위 말풍선
- 서비스 주소: http://game.aquabit.lab ("게임 시작" 버튼 링크로만 연결, .env로 바꿀 수 있게)

[페이지]
1. 메인(/): 큰 배너(Canvas로 픽셀 물고기가 헤엄치는 애니메이션 + "게임 시작" 버튼),
   최신 공지 3개, 서비스 특징 카드 3개
2. 회사 소개(/about): 비전, 개발 연혁, 팀원 4명 역할 카드(실명 없이),
   서비스 구성 소개(ESXi/vCenter 가상화, 1차·2차 네임서버, 사내 메일 서버, 웹 서버)
   - 팀 역할: 조장(ESXi·vCenter·NFS, 일정·문서 총괄), 조원1(dns1·dns2, 존 전송),
     조원2(Apache·Node.js·MySQL, 게임 서비스), 조원3(사내 메일 hMailServer, Windows Server)
3. 게임 소개(/game): Pixel Aquarium 기능을 단계별로 소개
4. 공지사항(/notices, /notices/:id): 분류(공지/업데이트/점검/이벤트) 필터, 목록, 상세, 이전·다음 글
5. 채용(/careers): 가상 채용 공고 3개
6. 고객센터(/support): FAQ 아코디언 + 문의 폼
7. 없는 주소용 404 페이지

[기술 스택]
- Node.js + Express + EJS (공통 head/header/footer는 partials로 분리)
- 공지, 채용, FAQ, 팀 정보는 data 폴더의 JSON 파일로 관리 (JSON만 고치면 반영)
- 포트는 기본 3001, 접속 주소는 기본 127.0.0.1 (.env의 PORT, HOST로 변경 가능)
- 나중에 Apache가 www.aquabit.lab 요청을 이 앱으로 프록시할 예정
- 외부 CDN, 외부 폰트, 외부 이미지 사용 금지 (학교 내부망에서 동작해야 함)
- 서버 패키지는 npm으로 설치하는 것만 사용 (express, ejs, helmet, nodemailer, dotenv 정도)

[문의 폼 동작]
- 서버에서 입력 검사: 이름, 이메일 형식, 분류(선택), 제목, 내용 10자 이상, 개인정보 동의
- 접수되면 ① data/inquiries.json에 저장하고
  ② nodemailer로 사내 메일 서버(hMailServer)에 SMTP 발송 → support@aquabit.lab 으로 전달
- SMTP 설정은 .env에서 읽기: SMTP_HOST(mail.aquabit.lab), SMTP_PORT(25), SMTP_USER, SMTP_PASS, MAIL_TO
  · 메일 서버는 실습용이라 25번 포트, 암호화 없이 로그인(AUTH LOGIN)해야 함
- 메일 발송이 실패해도 파일 저장은 되게 하고, 화면에 "접수됨(메일 전달 실패)"을 구분해서 안내
- 접수 후 새로고침해도 두 번 접수되지 않게 처리
- 스팸 방지: 사람에게 안 보이는 칸(honeypot), 같은 IP는 10분에 5건까지

[보안]
- helmet으로 보안 헤더 적용 (단, HTTP 사이트라서 CSS/JS가 깨지지 않게 upgrade-insecure-requests는 끄기)
- 화면 출력은 EJS 자동 이스케이프(<%= %>)로 XSS 방지
- 비밀번호는 코드에 넣지 말고 .env에만 두기
- .gitignore에 node_modules, .env, data/inquiries.json 넣고, 대신 .env.example 제공

[디자인]
- 바다/수족관 느낌의 파란 계열, 픽셀 아트 분위기 (각진 테두리, 픽셀 그림자)
- 로고, 아이콘, 물고기는 SVG나 Canvas로 직접 그리기 (외부 이미지 사용 금지)
- 실제 게임 회사 사이트(넥슨 등)의 로고나 디자인을 베끼지 말 것
- PC와 휴대폰 화면 모두 깨지지 않게 (휴대폰에서는 햄버거 메뉴)
- 움직임 줄이기 설정(prefers-reduced-motion)을 켠 사용자에게는 애니메이션 멈추기

[완성 후]
- README.md에 다음을 적어줘:
  1) 내 PC에서 실행하는 법 (npm install, .env 만들기, npm start)
  2) Rocky Linux 10 web VM에서 git clone으로 받아 실행하는 법 (dnf 기준)
  3) systemd 서비스로 등록해서 재부팅해도 자동 실행되게 하는 법
  4) Apache VirtualHost로 www.aquabit.lab → 127.0.0.1:3001 프록시하는 설정 예시
     (SELinux httpd_can_network_connect 설정 포함)
- 내가 GitHub에 올릴 거니까 git으로 올리기 좋게 정리해줘

먼저 폴더 구조와 페이지 구성을 보여주고, 내가 확인하면 만들어줘.