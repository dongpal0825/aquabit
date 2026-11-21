'use strict';

const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const data = require('../lib/data');
const store = require('../lib/inquiryStore');
const { sendInquiryMail } = require('../lib/mailer');
const { validateInquiry, INQUIRY_CATEGORIES } = require('../lib/validate');
const { createRateLimiter } = require('../lib/rateLimit');

const router = express.Router();
const limiter = createRateLimiter(config.rateLimit);

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RECEIPT_RE = /^Q\d{8}-[0-9A-F]{6}$/;
const RESULTS = ['sent', 'mail_failed'];

const EMPTY_VALUES = { name: '', email: '', category: '', subject: '', message: '', agree: false };

function renderSupport(res, status, extra = {}) {
  res.status(status).render('support', {
    pageTitle: '고객센터',
    faq: data.getFaq(),
    categories: INQUIRY_CATEGORIES,
    values: EMPTY_VALUES,
    errors: {},
    formError: null,
    result: null,
    receiptId: null,
    // 폼을 보여줄 때마다 새 제출 토큰을 만든다. 같은 토큰으로 두 번 보내면 한 번만 접수된다.
    token: crypto.randomUUID(),
    ...extra,
  });
}

// 접수 결과 화면으로 보낸다. (POST → 303 → GET: 새로고침해도 다시 전송되지 않음)
function redirectResult(res, result, receiptId) {
  const params = new URLSearchParams({ result });
  if (receiptId) params.set('id', receiptId);
  res.redirect(303, `/support?${params}#inquiry`);
}

router.get('/', (req, res) => {
  const result = RESULTS.includes(req.query.result) ? req.query.result : null;
  const receiptId = RECEIPT_RE.test(req.query.id || '') ? req.query.id : null;
  renderSupport(res, 200, { result, receiptId });
});

router.post('/inquiry', async (req, res, next) => {
  try {
    const body = req.body || {};

    // 1) honeypot: 사람에게는 보이지 않는 칸. 값이 있으면 봇으로 보고 저장하지 않는다.
    //    봇이 눈치채지 못하게 겉으로는 성공한 것처럼 보낸다.
    if (body.website) return redirectResult(res, 'sent');

    const { values, errors, ok } = validateInquiry(body);
    const token = TOKEN_RE.test(body.token || '') ? body.token : null;

    if (!token) {
      return renderSupport(res, 400, {
        values,
        formError: '폼 정보가 올바르지 않습니다. 페이지를 새로고침한 뒤 다시 작성해 주세요.',
      });
    }
    if (!ok) {
      return renderSupport(res, 400, { values, errors, token, formError: '입력 내용을 다시 확인해 주세요.' });
    }

    // 2) 같은 IP는 10분에 5건까지
    if (limiter.isLimited(req.ip)) {
      return renderSupport(res, 429, {
        values,
        token,
        formError: '짧은 시간에 너무 많은 문의가 접수되었습니다. 10분 뒤에 다시 시도해 주세요.',
      });
    }

    // 3) 파일 저장 (같은 토큰이면 저장하지 않고 기존 접수 결과를 보여 줌)
    const { duplicate, record } = await store.add(
      {
        name: values.name,
        email: values.email,
        category: values.category,
        subject: values.subject,
        message: values.message,
        ip: req.ip,
      },
      token
    );
    if (duplicate) {
      return redirectResult(res, record.mailStatus === 'failed' ? 'mail_failed' : 'sent', record.id);
    }
    limiter.hit(req.ip);

    // 4) 메일 발송. 실패해도 접수(파일 저장)는 이미 끝났다.
    let result = 'sent';
    try {
      await sendInquiryMail(record);
      await store.updateMailStatus(record.id, 'sent');
    } catch (err) {
      result = 'mail_failed';
      console.error(`[AQUABIT] 문의 ${record.id} 메일 전달 실패: ${err.message}`);
      await store.updateMailStatus(record.id, 'failed', err.message).catch(() => {});
    }
    return redirectResult(res, result, record.id);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
