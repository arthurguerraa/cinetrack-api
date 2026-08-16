const express = require('express');
const cors = require('cors');
require('dotenv').config();
require('./config/database');

const app = express();

// ----------------------------------------
// Configurações do Express
// ----------------------------------------

// CORS aberto para qualquer origem — correto para desenvolvimento local,
// já que o frontend é testado via file:// (origem "null") e não tem porta fixa.
// Quando for para produção, restrinja para o domínio real do frontend, ex:
// app.use(cors({ origin: 'https://seu-dominio.com' }));
app.use(cors());

app.use(express.json());

// teste se o servidor está rodando
app.get('/', (req, res) => {
  res.json({ message: 'CineTrack API rodando!' });
});

// ----------------------------------------
// Rotas do sistema
// ----------------------------------------
const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);

const filmeRoutes = require('./routes/filmeRoutes');
app.use('/filmes', filmeRoutes);

const avaliacaoRoutes = require('./routes/avaliacaoRoutes');
app.use('/avaliacoes', avaliacaoRoutes);

const listaRoutes = require('./routes/listaRoutes');
app.use('/listas', listaRoutes);

const rankingRoutes = require('./routes/rankingRoutes');
app.use('/ranking', rankingRoutes);

const generoRoutes = require('./routes/generoRoutes');
app.use('/generos', generoRoutes);

// ----------------------------------------
// Tratamento de erros — sempre depois das rotas
// ----------------------------------------
const tratarErros = require('./middlewares/errorMiddleware');
app.use(tratarErros);

module.exports = app;