const express = require('express');
const router = express.Router();
const { buscarFilmes } = require('../controllers/filmeController');

router.get('/buscar', buscarFilmes);

module.exports = router;