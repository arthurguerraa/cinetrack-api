const express = require('express');
const router = express.Router();
const { listarPopulares, listarPorGenero, buscarFilmes } = require('../controllers/filmeController');

router.get('/populares', listarPopulares);
router.get('/genero', listarPorGenero);
router.get('/buscar', buscarFilmes);

module.exports = router;