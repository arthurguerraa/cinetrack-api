const express = require('express');
const router = express.Router();
const {
  cadastrar,
  login,
  verificarCodigo,
  reenviarCodigo,
  esqueciSenha,
  redefinirSenha,
} = require('../controllers/authController');

router.post('/cadastrar', cadastrar);
router.post('/login', login);
router.post('/verificar', verificarCodigo);
router.post('/reenviar-codigo', reenviarCodigo);
router.post('/esqueci-senha', esqueciSenha);
router.post('/redefinir-senha', redefinirSenha);

module.exports = router;