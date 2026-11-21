'use strict';

const express = require('express');
const data = require('../lib/data');

const router = express.Router();
const PAGE_SIZE = 10;

router.get('/', (req, res) => {
  const all = data.getNotices();
  const category = Object.hasOwn(data.NOTICE_CATEGORIES, req.query.category) ? req.query.category : '';
  const filtered = category ? all.filter((n) => n.category === category) : all;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const requested = Number.parseInt(req.query.page, 10);
  const page = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), totalPages) : 1;

  res.render('notices/list', {
    pageTitle: '공지사항',
    categories: data.NOTICE_CATEGORIES,
    category,
    notices: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: filtered.length,
    page,
    totalPages,
  });
});

router.get('/:id', (req, res, next) => {
  if (!/^\d{1,9}$/.test(req.params.id)) return next(); // 404로
  const id = Number(req.params.id);
  const all = data.getNotices(); // 최신순
  const index = all.findIndex((n) => n.id === id);
  if (index === -1) return next();

  res.render('notices/detail', {
    pageTitle: all[index].title,
    notice: all[index],
    newer: all[index - 1] || null, // 다음 글 (더 최근)
    older: all[index + 1] || null, // 이전 글 (더 예전)
  });
});

module.exports = router;
