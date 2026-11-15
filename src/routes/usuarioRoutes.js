const express = require('express');
const router = express.Router();
const verificarToken = require('../middlewares/authMiddleware');
const usuarioController = require('../controllers/usuarioController');

router.get('/me', verificarToken, usuarioController.obterMeuPerfil);
router.put('/foto', verificarToken, usuarioController.atualizarFoto);
router.delete('/foto', verificarToken, usuarioController.removerFoto);

module.exports = router;