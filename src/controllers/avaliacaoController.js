const pool = require('../config/database');

// CRIAR AVALIAÇÃO
const avaliarFilme = async (req, res) => {
  const { id_filme, nr_nota, ds_comentario } = req.body;
  const id_usuario = req.usuario.id_usuario;

  if (!id_filme || !nr_nota) {
    return res.status(400).json({ error: 'Informe o filme e a nota.' });
  }

  if (nr_nota < 1 || nr_nota > 10) {
    return res.status(400).json({ error: 'A nota deve ser entre 1 e 10.' });
  }

  try {
    const [filme] = await pool.query(
      'SELECT id_filme FROM TB_Filme WHERE id_filme = ?',
      [id_filme]
    );

    if (filme.length === 0) {
      return res.status(404).json({ error: 'Filme não encontrado.' });
    }

    const [avaliacaoExistente] = await pool.query(
      'SELECT id_avaliacao FROM TB_Avaliacao WHERE id_usuario = ? AND id_filme = ?',
      [id_usuario, id_filme]
    );

    if (avaliacaoExistente.length > 0) {
      return res.status(409).json({ error: 'Você já avaliou esse filme.' });
    }

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

// LISTAR MINHAS AVALIAÇÕES (para a tela de perfil)
const listarMinhasAvaliacoes = async (req, res) => {
  const id_usuario = req.usuario.id_usuario;

  try {
    const [avaliacoes] = await pool.query(
      `SELECT 
         a.id_avaliacao,
         a.nr_nota,
         a.ds_comentario,
         a.created_at,
         f.id_filme,
         f.nm_filme,
         f.ds_poster,
         f.dt_lancamento
       FROM TB_Avaliacao a
       INNER JOIN TB_Filme f ON a.id_filme = f.id_filme
       WHERE a.id_usuario = ?
       ORDER BY a.created_at DESC`,
      [id_usuario]
    );

    res.json(avaliacoes);
  } catch (err) {
    console.error('Erro ao listar avaliações do usuário:', err.message);
    res.status(500).json({ error: 'Erro ao listar suas avaliações.' });
  }
};

// EDITAR AVALIAÇÃO
const editarAvaliacao = async (req, res) => {
  const { id_avaliacao } = req.params;
  const { nr_nota, ds_comentario } = req.body;
  const id_usuario = req.usuario.id_usuario;

  if (nr_nota && (nr_nota < 1 || nr_nota > 10)) {
    return res.status(400).json({ error: 'A nota deve ser entre 1 e 10.' });
  }

  try {
    const [avaliacao] = await pool.query(
      'SELECT * FROM TB_Avaliacao WHERE id_avaliacao = ? AND id_usuario = ?',
      [id_avaliacao, id_usuario]
    );

    if (avaliacao.length === 0) {
      return res.status(404).json({ error: 'Avaliação não encontrada.' });
    }

    await pool.query(
      `UPDATE TB_Avaliacao 
       SET nr_nota = ?, ds_comentario = ?
       WHERE id_avaliacao = ?`,
      [
        nr_nota || avaliacao[0].nr_nota,
        ds_comentario ?? avaliacao[0].ds_comentario,
        id_avaliacao,
      ]
    );

    res.json({ message: 'Avaliação atualizada com sucesso!' });
  } catch (err) {
    console.error('Erro ao editar avaliação:', err.message);
    res.status(500).json({ error: 'Erro ao editar avaliação.' });
  }
};

// DELETAR AVALIAÇÃO
const deletarAvaliacao = async (req, res) => {
  const { id_avaliacao } = req.params;
  const id_usuario = req.usuario.id_usuario;

  try {
    const [avaliacao] = await pool.query(
      'SELECT * FROM TB_Avaliacao WHERE id_avaliacao = ? AND id_usuario = ?',
      [id_avaliacao, id_usuario]
    );

    if (avaliacao.length === 0) {
      return res.status(404).json({ error: 'Avaliação não encontrada.' });
    }

    await pool.query('DELETE FROM TB_Avaliacao WHERE id_avaliacao = ?', [id_avaliacao]);

    res.json({ message: 'Avaliação deletada com sucesso!' });
  } catch (err) {
    console.error('Erro ao deletar avaliação:', err.message);
    res.status(500).json({ error: 'Erro ao deletar avaliação.' });
  }
};

module.exports = {
  avaliarFilme,
  listarMinhasAvaliacoes,
  editarAvaliacao,
  deletarAvaliacao,
};