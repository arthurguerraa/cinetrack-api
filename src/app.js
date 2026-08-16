const express = require('express');
const cors = require('cors'); // Importado aqui no topo
require('dotenv').config();
require('./config/database');

const app = express();

// Configurações do Express
app.use(cors()); // Libera o CORS para o seu frontend funcionar!
app.use(express.json());

// Teste se o servidor está rodando
app.get('/', (req, res) => {
  res.json({ message: 'CineTrack API rodando!' });
});

// Rotas do Sistema
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

// Tratamento de erros (Sempre depois das rotas e antes do module.exports)
const tratarErros = require('./middlewares/errorMiddleware');
app.use(tratarErros);

// FAÇA O SERVIDOR RODAR NA PORTA 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando com sucesso na porta ${PORT}!`);
});

module.exports = app;
