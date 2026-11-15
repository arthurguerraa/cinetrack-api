const express = require('express');
const verificarToken = require('../middlewares/authMiddleware');
const usuarioController = require('../controllers/usuarioController');

// Recebe o rate limiter das rotas sensíveis (senha, email e exclusão de conta),
// seguindo o mesmo padrão de injeção usado em authRoutes.js.
module.exports = (limiteConta) => {
  const router = express.Router();

  // perfil e foto
  router.get('/me', verificarToken, usuarioController.obterMeuPerfil);
  router.put('/foto', verificarToken, usuarioController.atualizarFoto);
  router.delete('/foto', verificarToken, usuarioController.removerFoto);

  // nome
  router.put('/nome', verificarToken, usuarioController.atualizarNome);

  // senha
  router.put('/senha', limiteConta, verificarToken, usuarioController.alterarSenha);

  // troca de email (2 passos)
  router.post('/email/solicitar', limiteConta, verificarToken, usuarioController.solicitarTrocaEmail);
  router.post('/email/reenviar', limiteConta, verificarToken, usuarioController.reenviarCodigoTrocaEmail);
  router.post('/email/confirmar', limiteConta, verificarToken, usuarioController.confirmarTrocaEmail);

  // exclusão de conta
  router.delete('/', limiteConta, verificarToken, usuarioController.excluirConta);

  return router;
};