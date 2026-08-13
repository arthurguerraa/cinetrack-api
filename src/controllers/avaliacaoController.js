const pool = require('../config/database');

const avaliarFilme = async (req, res) => {
  const { id_filme, nr_nota, ds_comentario } = req.body;
  const id_usuario = req.usuario.id_usuario; // veio do token, via middleware

  if (!id_filme || !nr_nota) {
    return res.status(400).json({ error: 'Informe o filme e a nota.' });
  }

  if (nr_nota < 1 || nr_nota > 10) {
    return res.status(400).json({ error: 'A nota deve ser entre 1 e 10.' });
  }

  try {
    // verifica se o filme existe
    const [filme] = await pool.query(
      'SELECT id_filme FROM TB_Filme WHERE id_filme = ?',
      [id_filme]
    );

    if (filme.length === 0) {
      return res.status(404).json({ error: 'Filme não encontrado.' });
    }

    // verifica se o usuário já avaliou esse filme
    const [avaliacaoExistente] = await pool.query(
      'SELECT id_avaliacao FROM TB_Avaliacao WHERE id_usuario = ? AND id_filme = ?',
      [id_usuario, id_filme]
    );

    if (avaliacaoExistente.length > 0) {
      return res.status(409).json({ error: 'Você já avaliou esse filme.' });
    }

    // insere a avaliação
    await pool.query(
      `INSERT INTO TB_Avaliacao (nr_nota, ds_comentario, id_usuario, id_filme)
       VALUES (?, ?, ?, ?)`,
      [nr_nota, ds_comentario || null, id_usuario, id_filme]
    );

    res.status(201).json({ message: 'Avaliação registrada com sucesso!' });
  } catch (err) {
    console.error('Erro ao avaliar filme:', err.message);
    res.status(500).json({ error: 'Erro ao avaliar filme.' });
  }
};

module.exports = { avaliarFilme };