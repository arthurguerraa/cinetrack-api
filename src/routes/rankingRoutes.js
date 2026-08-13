const express = require('express');
const router = express.Router();
const { verRanking } = require('../controllers/rankingController');

router.get('/', verRanking);

module.exports = router;