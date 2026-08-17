const express = require('express');
const router = express.Router();
const {
  avaliarFilme,
  listarMinhasAvaliacoes,
  editarAvaliacao,
  deletarAvaliacao,
} = require('../controllers/avaliacaoController');
const verificarToken = require('../middlewares/authMiddleware');

router.post('/', verificarToken, avaliarFilme);
router.get('/minhas', verificarToken, listarMinhasAvaliacoes);
router.put('/:id_avaliacao', verificarToken, editarAvaliacao);
router.delete('/:id_avaliacao', verificarToken, deletarAvaliacao);

module.exports = router;