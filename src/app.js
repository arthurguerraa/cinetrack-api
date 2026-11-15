const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
require('./config/database');

const app = express();
app.set('trust proxy', 1); /* Se o deploy for atrás de um proxy (Railway, Render, Vercel), adicionar isso logo depois de criar o app */

// ----------------------------------------
// Configurações do Express
// ----------------------------------------

// CORS aberto para qualquer origem — correto para desenvolvimento local,
// já que o frontend é testado via file:// (origem "null") e não tem porta fixa.
// Quando for para produção, restrinja para o domínio real do frontend, ex:
// app.use(cors({ origin: 'https://seu-dominio.com' }));
app.use(helmet({
  crossOriginResourcePolicy: false, // necessário para o frontend em outra origem conseguir consumir a API
}));
app.use(cors());
// limite maior que o padrão (100kb) para comportar a foto de perfil em base64
app.use(express.json({ limit: '300kb' }));

const limiteGeral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiteGeral);

const limiteAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rotas sensíveis da conta (trocar senha/email, excluir conta).
// Instância separada de limiteAuth, para os contadores não se misturarem.
const limiteConta = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// teste se o servidor está rodando
app.get('/', (req, res) => {
  res.json({ message: 'CineTrack API rodando!' });
});

// ----------------------------------------
// Rotas do sistema
// ----------------------------------------
const authRoutes = require('./routes/authRoutes')(limiteAuth);
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

const usuarioRoutes = require('./routes/usuarioRoutes')(limiteConta);
app.use('/usuarios', usuarioRoutes);

// ----------------------------------------
// Tratamento de erros — sempre depois das rotas
// ----------------------------------------
const tratarErros = require('./middlewares/errorMiddleware');
app.use(tratarErros);

module.exports = app;