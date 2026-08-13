const express = require('express');
const router = express.Router();
const { buscarFilmes, listarFilmes } = require('../controllers/filmeController');

router.get('/buscar', buscarFilmes);
router.get('/', listarFilmes);

module.exports = router;