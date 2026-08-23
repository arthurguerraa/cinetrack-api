const express = require('express');
const {
  cadastrar,
  login,
  verificarCodigo,
  reenviarCodigo,
  esqueciSenha,
  redefinirSenha,
} = require('../controllers/authController');

module.exports = (limiteAuth) => {
  const router = express.Router();

  router.post('/cadastrar', limiteAuth, cadastrar);
  router.post('/login', limiteAuth, login);
  router.post('/verificar', limiteAuth, verificarCodigo);
  router.post('/reenviar-codigo', limiteAuth, reenviarCodigo);
  router.post('/esqueci-senha', limiteAuth, esqueciSenha);
  router.post('/redefinir-senha', limiteAuth, redefinirSenha);

  return router;
};