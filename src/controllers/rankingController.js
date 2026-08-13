const pool = require('../config/database');

const verRanking = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  try {
    const [ranking] = await pool.query(
      `SELECT 
         f.id_filme,
         f.nm_filme,
         f.ds_poster,
         f.dt_lancamento,
         AVG(a.nr_nota) AS nota_media_usuarios,
         COUNT(a.id_avaliacao) AS total_avaliacoes
       FROM TB_Filme f
       INNER JOIN TB_Avaliacao a ON f.id_filme = a.id_filme
       GROUP BY f.id_filme
       ORDER BY nota_media_usuarios DESC, total_avaliacoes DESC
       LIMIT ?`,
      [limit]
    );

    res.json(ranking);
  } catch (err) {
    console.error('Erro ao buscar ranking:', err.message);
    res.status(500).json({ error: 'Erro ao buscar ranking.' });
  }
};

module.exports = { verRanking };