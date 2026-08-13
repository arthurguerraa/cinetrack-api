const express = require('express');
const router = express.Router();
const { sincronizarGeneros, listarGeneros } = require('../controllers/generoController');

router.post('/sincronizar', sincronizarGeneros); // rodar uma vez só
router.get('/', listarGeneros);

module.exports = router;