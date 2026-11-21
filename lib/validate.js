'use strict';

// 문의 폼 서버 측 입력 검사

const INQUIRY_CATEGORIES = {
  game: '게임 이용',
  account: '계정·어항 초대',
  bug: '버그 신고',
  partner: '제휴·기타',
};

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

// 한 줄 입력값: 앞뒤 공백 제거, 줄바꿈·제어문자 제거 (메일 헤더에 들어가므로)
function oneLine(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim();
}

// 여러 줄 입력값: 줄바꿈은 살리고 나머지 제어문자 제거
function multiLine(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, '')
    .trim();
}

function validateInquiry(body) {
  const values = {
    name: oneLine(body.name),
    email: oneLine(body.email),
    category: oneLine(body.category),
    subject: oneLine(body.subject),
    message: multiLine(body.message),
    agree: body.agree === 'on',
  };
  const errors = {};

  if (!values.name) errors.name = '이름을 입력해 주세요.';
  else if (values.name.length > 30) errors.name = '이름은 30자 이하로 입력해 주세요.';

  if (!values.email) errors.email = '이메일을 입력해 주세요.';
  else if (values.email.length > 100 || !EMAIL_RE.test(values.email)) {
    errors.email = '이메일 형식이 올바르지 않습니다. (예: user@aquabit.lab)';
  }

  if (!Object.hasOwn(INQUIRY_CATEGORIES, values.category)) {
    errors.category = '문의 분류를 선택해 주세요.';
  }

  if (!values.subject) errors.subject = '제목을 입력해 주세요.';
  else if (values.subject.length > 100) errors.subject = '제목은 100자 이하로 입력해 주세요.';

  if ([...values.message].length < 10) errors.message = '내용을 10자 이상 입력해 주세요.';
  else if (values.message.length > 3000) errors.message = '내용은 3000자 이하로 입력해 주세요.';

  if (!values.agree) errors.agree = '개인정보 수집·이용에 동의해 주세요.';

  return { values, errors, ok: Object.keys(errors).length === 0 };
}

module.exports = { validateInquiry, INQUIRY_CATEGORIES };
