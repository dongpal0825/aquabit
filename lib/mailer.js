'use strict';

// 사내 메일 서버(hMailServer)로 문의 메일을 보낸다.
// 실습용 메일 서버라서 25번 포트, 암호화(STARTTLS) 없이 AUTH LOGIN으로 로그인한다.
const nodemailer = require('nodemailer');
const config = require('../config');
const { INQUIRY_CATEGORIES } = require('./validate');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { host, port, user, pass } = config.smtp;
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: false, // 처음부터 TLS로 연결하지 않음
    ignoreTLS: true, // 서버가 STARTTLS를 지원해도 쓰지 않음
    ...(user ? { auth: { user, pass }, authMethod: 'LOGIN' } : {}),
    // 메일 서버가 꺼져 있어도 접수 화면이 오래 멈추지 않게 짧게 잡는다.
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
  return transporter;
}

function sendInquiryMail(record) {
  const category = INQUIRY_CATEGORIES[record.category] || record.category;
  const text = [
    `접수 번호: ${record.id}`,
    `접수 시각: ${record.createdAt}`,
    `분류: ${category}`,
    `이름: ${record.name}`,
    `이메일: ${record.email}`,
    `접속 IP: ${record.ip}`,
    '',
    `제목: ${record.subject}`,
    '',
    record.message,
    '',
    '-- AQUABIT 홈페이지 고객센터 문의 폼에서 발송된 메일입니다.',
  ].join('\n');

  return getTransporter().sendMail({
    from: { name: 'AQUABIT 고객센터', address: config.smtp.from },
    to: config.smtp.to,
    replyTo: { name: record.name, address: record.email },
    subject: `[AQUABIT 문의][${category}] ${record.subject}`,
    text,
  });
}

module.exports = { sendInquiryMail };
