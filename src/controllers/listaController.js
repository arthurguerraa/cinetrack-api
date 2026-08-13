const pool = require('../config/database');

// CRIAR LISTA
const criarLista = async (req, res) => {
  const { nm_lista, ds_lista, is_visibilidade } = req.body;
  const id_usuario = req.usuario.id_usuario;

  if (!nm_lista) {
    return res.status(400).json({ error: 'Informe o nome da lista.' });
  }

  try {
    const [resultado] = await pool.query(
      `INSERT INTO TB_Lista (nm_lista, ds_lista, is_visibilidade, id_usuario)
       VALUES (?, ?, ?, ?)`,
      [nm_lista, ds_lista || null, is_visibilidade ?? true, id_usuario]
    );

    res.status(201).json({
      message: 'Lista criada com sucesso!',
      id_lista: resultado.insertId,
    });
  } catch (err) {
    console.error('Erro ao criar lista:', err.message);
    res.status(500).json({ error: 'Erro ao criar lista.' });
  }
};

// LISTAR LISTAS DO USUÁRIO
const listarMinhasListas = async (req, res) => {
  const id_usuario = req.usuario.id_usuario;

  try {
    const [listas] = await pool.query(
      'SELECT * FROM TB_Lista WHERE id_usuario = ? ORDER BY created_at DESC',
      [id_usuario]
    );

    res.json(listas);
  } catch (err) {
    console.error('Erro ao listar listas:', err.message);
    res.status(500).json({ error: 'Erro ao listar listas.' });
  }
};

// ADICIONAR FILME À LISTA
const adicionarFilme = async (req, res) => {
  const { id_lista, id_filme } = req.body;
  const id_usuario = req.usuario.id_usuario;

  if (!id_lista || !id_filme) {
    return res.status(400).json({ error: 'Informe a lista e o filme.' });
  }

  try {
    // verifica se a lista pertence ao usuário logado
    const [lista] = await pool.query(
      'SELECT id_lista FROM TB_Lista WHERE id_lista = ? AND id_usuario = ?',
      [id_lista, id_usuario]
    );

    if (lista.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada.' });
    }

    // verifica se o filme existe
    const [filme] = await pool.query(
      'SELECT id_filme FROM TB_Filme WHERE id_filme = ?',
      [id_filme]
    );

    if (filme.length === 0) {
      return res.status(404).json({ error: 'Filme não encontrado.' });
    }

    // verifica se o filme já está na lista
    const [existe] = await pool.query(
      'SELECT * FROM TB_Lista_Filme WHERE id_lista = ? AND id_filme = ?',
      [id_lista, id_filme]
    );

    if (existe.length > 0) {
      return res.status(409).json({ error: 'Filme já está nessa lista.' });
    }

    await pool.query(
      'INSERT INTO TB_Lista_Filme (id_lista, id_filme) VALUES (?, ?)',
      [id_lista, id_filme]
    );

    res.status(201).json({ message: 'Filme adicionado à lista com sucesso!' });
  } catch (err) {
    console.error('Erro ao adicionar filme à lista:', err.message);
    res.status(500).json({ error: 'Erro ao adicionar filme à lista.' });
  }
};

// VER FILMES DE UMA LISTA
const verFilmesDaLista = async (req, res) => {
  const { id_lista } = req.params;
  const id_usuario = req.usuario.id_usuario;

  try {
    // verifica se a lista existe e é do usuário (ou é pública)
    const [lista] = await pool.query(
      'SELECT * FROM TB_Lista WHERE id_lista = ?',
      [id_lista]
    );

    if (lista.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada.' });
    }

    const listaEncontrada = lista[0];

    if (!listaEncontrada.is_visibilidade && listaEncontrada.id_usuario !== id_usuario) {
      return res.status(403).json({ error: 'Essa lista é privada.' });
    }

    const [filmes] = await pool.query(
      `SELECT f.* FROM TB_Filme f
       INNER JOIN TB_Lista_Filme lf ON f.id_filme = lf.id_filme
       WHERE lf.id_lista = ?
       ORDER BY lf.dt_adicionado DESC`,
      [id_lista]
    );

    res.json({ lista: listaEncontrada, filmes });
  } catch (err) {
    console.error('Erro ao buscar filmes da lista:', err.message);
    res.status(500).json({ error: 'Erro ao buscar filmes da lista.' });
  }
};

module.exports = { criarLista, listarMinhasListas, adicionarFilme, verFilmesDaLista };