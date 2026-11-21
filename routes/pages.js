'use strict';

const express = require('express');
const data = require('../lib/data');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('index', {
    pageTitle: null,
    latestNotices: data.getNotices().slice(0, 3),
  });
});

router.get('/about', (req, res) => {
  res.render('about', {
    pageTitle: '회사 소개',
    team: data.getTeam(),
    history: data.getHistory(),
  });
});

router.get('/game', (req, res) => {
  res.render('game', { pageTitle: '게임 소개' });
});

router.get('/careers', (req, res) => {
  res.render('careers', { pageTitle: '채용', careers: data.getCareers() });
});

module.exports = router;
