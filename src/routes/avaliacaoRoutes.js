const express = require('express');
const router = express.Router();
const { avaliarFilme } = require('../controllers/avaliacaoController');
const verificarToken = require('../middlewares/authMiddleware');

router.post('/', verificarToken, avaliarFilme);

module.exports = router;