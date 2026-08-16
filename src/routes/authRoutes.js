const express = require('express');
const router = express.Router();
const { cadastrar, login, verificarCodigo, reenviarCodigo } = require('../controllers/authController');

router.post('/cadastrar', cadastrar);
router.post('/login', login);
router.post('/verificar', verificarCodigo);
router.post('/reenviar-codigo', reenviarCodigo);

module.exports = router;