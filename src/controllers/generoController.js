const pool = require('../config/database');
const axios = require('axios');

// busca os gêneros no TMDB e salva no banco (roda uma vez só)
const sincronizarGeneros = async (req, res) => {
  try {
    const resposta = await axios.get('https://api.themoviedb.org/3/genre/movie/list', {
      params: {
        api_key: process.env.TMDB_API_KEY,
        language: 'pt-BR',
      },
    });

    const generos = resposta.data.genres; // [{ id, name }, ...]

    for (const genero of generos) {
      const [existe] = await pool.query(
        'SELECT id_genero FROM TB_Genero WHERE id_tmdb = ?',
        [genero.id]
      );

      if (existe.length === 0) {
        await pool.query(
          'INSERT INTO TB_Genero (nm_genero, id_tmdb) VALUES (?, ?)',
          [genero.name, genero.id]
        );
      }
    }

    res.json({ message: 'Gêneros sincronizados com sucesso!' });
  } catch (err) {
    console.error('Erro ao sincronizar gêneros:', err.message);
    res.status(500).json({ error: 'Erro ao sincronizar gêneros.' });
  }
};

// lista os gêneros salvos no banco
const listarGeneros = async (req, res) => {
  try {
    const [generos] = await pool.query(
      'SELECT id_genero, nm_genero FROM TB_Genero ORDER BY nm_genero'
    );
    res.json(generos);
  } catch (err) {
    console.error('Erro ao listar gêneros:', err.message);
    res.status(500).json({ error: 'Erro ao listar gêneros.' });
  }
};

module.exports = { sincronizarGeneros, listarGeneros };