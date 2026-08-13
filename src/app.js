const express = require('express');
require('dotenv').config();
require('./config/database');

const app = express();

app.use(express.json());

// teste se o servidor está rodando
app.get('/', (req, res) => {
  res.json({ message: 'CineTrack API rodando!' });
});

const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);
const filmeRoutes = require('./routes/filmeRoutes');
app.use('/filmes', filmeRoutes);
const avaliacaoRoutes = require('./routes/avaliacaoRoutes');
app.use('/avaliacoes', avaliacaoRoutes);
const listaRoutes = require('./routes/listaRoutes');
app.use('/listas', listaRoutes);

module.exports = app;