const express = require('express');
const router = express.Router();
const verificarToken = require('../middlewares/authMiddleware');
const {
  criarLista,
  listarMinhasListas,
  adicionarFilme,
  verFilmesDaLista,
} = require('../controllers/listaController');

router.post('/', verificarToken, criarLista);
router.get('/', verificarToken, listarMinhasListas);
router.post('/filmes', verificarToken, adicionarFilme);
router.get('/:id_lista/filmes', verificarToken, verFilmesDaLista);

module.exports = router;