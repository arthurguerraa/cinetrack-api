const axios = require('axios');
const pool = require('../config/database');

const TMDB_URL = 'https://api.themoviedb.org/3';
const MAX_DURACOES_POR_REQUISICAO = 30;

// ids de filmes cuja duração já está sendo buscada, para requisições simultâneas
// não consultarem o TMDB duas vezes pelo mesmo filme
const duracaoEmBusca = new Set();

// ----------------------------------------
// Duração dos filmes (buscada no TMDB sob demanda e guardada em TB_Filme)
// ----------------------------------------

// Devolve a duração em minutos, ou 0 se o filme não foi encontrado / não tem duração.
// Lança erro em falha de rede, para NÃO gravar "0" por causa de uma falha passageira.
async function buscarDuracaoNoTMDB(filme) {
  const tituloNormalizado = String(filme.nm_filme).trim().toLowerCase();

  for (const language of ['pt-BR', 'en-US']) {
    const { data } = await axios.get(`${TMDB_URL}/search/movie`, {
      params: {
        api_key: process.env.TMDB_API_KEY,
        query: filme.nm_filme,
        primary_release_year: filme.dt_lancamento,
        language,
      },
      timeout: 8000,
    });

    const resultados = data.results || [];
    const candidato =
      resultados.find((r) => String(r.title || '').trim().toLowerCase() === tituloNormalizado) ||
      resultados[0];

    if (candidato) {
      const { data: detalhes } = await axios.get(`${TMDB_URL}/movie/${candidato.id}`, {
        params: { api_key: process.env.TMDB_API_KEY, language: 'pt-BR' },
        timeout: 8000,
      });

      return detalhes.runtime > 0 ? detalhes.runtime : 0;
    }
  }

  return 0;
}

// Dispara a busca em segundo plano (sem await): a resposta da rota sai na hora e o
// frontend consulta de novo depois. Cada requisição cuida de um lote de filmes.
function iniciarBuscaDeDuracoes(filmes) {
  if (!process.env.TMDB_API_KEY) return;

  const faltando = filmes
    .filter((f) => f.nr_duracao === null && !duracaoEmBusca.has(f.id_filme))
    .slice(0, MAX_DURACOES_POR_REQUISICAO);

  faltando.forEach((f) => duracaoEmBusca.add(f.id_filme));

  Promise.allSettled(
    faltando.map(async (filme) => {
      try {
        const minutos = await buscarDuracaoNoTMDB(filme);
        await pool.query('UPDATE TB_Filme SET nr_duracao = ? WHERE id_filme = ?', [minutos, filme.id_filme]);
      } catch (err) {
        console.error(`Erro ao buscar duração do filme ${filme.id_filme}:`, err.message);
      } finally {
        duracaoEmBusca.delete(filme.id_filme);
      }
    })
  );
}

// ----------------------------------------
// CRIAR LISTA
// ----------------------------------------
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

// ----------------------------------------
// LISTAR LISTAS DO USUÁRIO
// ----------------------------------------
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

// ----------------------------------------
// ADICIONAR FILME À LISTA
// ----------------------------------------
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

// ----------------------------------------
// VER FILMES DE UMA LISTA
// Devolve { lista, is_dono, duracoes_pendentes, filmes }.
// O progresso (assistido) só é devolvido ao dono da lista.
// ----------------------------------------
const verFilmesDaLista = async (req, res) => {
  const { id_lista } = req.params;
  const id_usuario = req.usuario.id_usuario;

  try {
    const [lista] = await pool.query(
      `SELECT l.id_lista, l.nm_lista, l.ds_lista, l.is_visibilidade, l.id_usuario, l.created_at,
              u.nm_usuario AS nm_dono
       FROM TB_Lista l
       INNER JOIN TB_Usuario u ON u.id_usuario = l.id_usuario
       WHERE l.id_lista = ?`,
      [id_lista]
    );

    if (lista.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada.' });
    }

    const listaEncontrada = lista[0];
    const is_dono = listaEncontrada.id_usuario === id_usuario;

    if (!listaEncontrada.is_visibilidade && !is_dono) {
      return res.status(403).json({ error: 'Essa lista é privada.' });
    }

    const [filmes] = await pool.query(
      `SELECT f.id_filme, f.nm_filme, f.ds_sinopse, f.dt_lancamento, f.nr_nota_media,
              f.ds_poster, f.nr_duracao,
              lf.dt_adicionado, lf.is_assistido, lf.dt_assistido
       FROM TB_Filme f
       INNER JOIN TB_Lista_Filme lf ON f.id_filme = lf.id_filme
       WHERE lf.id_lista = ?
       ORDER BY lf.dt_adicionado DESC, f.id_filme DESC`,
      [id_lista]
    );

    // filmes cuja duração ainda não foi buscada (NULL); 0 significa "não encontrada"
    const duracoes_pendentes = process.env.TMDB_API_KEY
      ? filmes.filter((f) => f.nr_duracao === null).length
      : 0;

    iniciarBuscaDeDuracoes(filmes);

    res.json({
      lista: listaEncontrada,
      is_dono,
      duracoes_pendentes,
      filmes: filmes.map((f) => ({
        ...f,
        nr_duracao: f.nr_duracao || null,
        is_assistido: is_dono ? Boolean(f.is_assistido) : false,
        dt_assistido: is_dono ? f.dt_assistido : null,
      })),
    });
  } catch (err) {
    console.error('Erro ao buscar filmes da lista:', err.message);
    res.status(500).json({ error: 'Erro ao buscar filmes da lista.' });
  }
};

// ----------------------------------------
// MARCAR / DESMARCAR FILME COMO ASSISTIDO (só o dono da lista)
// PUT /listas/:id_lista/filmes/:id_filme/assistido   body: { is_assistido: true|false }
// ----------------------------------------
const marcarAssistido = async (req, res) => {
  const { id_lista, id_filme } = req.params;
  const { is_assistido } = req.body || {};
  const id_usuario = req.usuario.id_usuario;

  if (typeof is_assistido !== 'boolean') {
    return res.status(400).json({ error: 'Informe se o filme foi assistido (true ou false).' });
  }

  try {
    const [lista] = await pool.query(
      'SELECT id_lista FROM TB_Lista WHERE id_lista = ? AND id_usuario = ?',
      [id_lista, id_usuario]
    );

    if (lista.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada.' });
    }

    const [vinculo] = await pool.query(
      'SELECT id_filme FROM TB_Lista_Filme WHERE id_lista = ? AND id_filme = ?',
      [id_lista, id_filme]
    );

    if (vinculo.length === 0) {
      return res.status(404).json({ error: 'Esse filme não está na lista.' });
    }

    await pool.query(
      `UPDATE TB_Lista_Filme
       SET is_assistido = ?, dt_assistido = ${is_assistido ? 'NOW()' : 'NULL'}
       WHERE id_lista = ? AND id_filme = ?`,
      [is_assistido, id_lista, id_filme]
    );

    res.json({
      message: is_assistido ? 'Filme marcado como assistido!' : 'Filme voltou para "para assistir".',
    });
  } catch (err) {
    console.error('Erro ao marcar filme como assistido:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar o filme.' });
  }
};

// ----------------------------------------
// REMOVER FILME DA LISTA (só o dono da lista)
// DELETE /listas/:id_lista/filmes/:id_filme
// ----------------------------------------
const removerFilmeDaLista = async (req, res) => {
  const { id_lista, id_filme } = req.params;
  const id_usuario = req.usuario.id_usuario;

  try {
    const [lista] = await pool.query(
      'SELECT id_lista FROM TB_Lista WHERE id_lista = ? AND id_usuario = ?',
      [id_lista, id_usuario]
    );

    if (lista.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada.' });
    }

    const [vinculo] = await pool.query(
      'SELECT id_filme FROM TB_Lista_Filme WHERE id_lista = ? AND id_filme = ?',
      [id_lista, id_filme]
    );

    if (vinculo.length === 0) {
      return res.status(404).json({ error: 'Esse filme não está na lista.' });
    }

    await pool.query(
      'DELETE FROM TB_Lista_Filme WHERE id_lista = ? AND id_filme = ?',
      [id_lista, id_filme]
    );

    res.json({ message: 'Filme removido da lista com sucesso!' });
  } catch (err) {
    console.error('Erro ao remover filme da lista:', err.message);
    res.status(500).json({ error: 'Erro ao remover filme da lista.' });
  }
};

// ----------------------------------------
// EDITAR LISTA
// ----------------------------------------
const editarLista = async (req, res) => {
  const { id_lista } = req.params;
  const { nm_lista, ds_lista, is_visibilidade } = req.body;
  const id_usuario = req.usuario.id_usuario;

  try {
    // verifica se a lista existe e pertence ao usuário
    const [lista] = await pool.query(
      'SELECT * FROM TB_Lista WHERE id_lista = ? AND id_usuario = ?',
      [id_lista, id_usuario]
    );

    if (lista.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada.' });
    }

    await pool.query(
      `UPDATE TB_Lista 
       SET nm_lista = ?, ds_lista = ?, is_visibilidade = ?
       WHERE id_lista = ?`,
      [
        nm_lista || lista[0].nm_lista,
        ds_lista ?? lista[0].ds_lista,
        is_visibilidade ?? lista[0].is_visibilidade,
        id_lista,
      ]
    );

    res.json({ message: 'Lista atualizada com sucesso!' });
  } catch (err) {
    console.error('Erro ao editar lista:', err.message);
    res.status(500).json({ error: 'Erro ao editar lista.' });
  }
};

// ----------------------------------------
// DELETAR LISTA
// ----------------------------------------
const deletarLista = async (req, res) => {
  const { id_lista } = req.params;
  const id_usuario = req.usuario.id_usuario;

  try {
    const [lista] = await pool.query(
      'SELECT * FROM TB_Lista WHERE id_lista = ? AND id_usuario = ?',
      [id_lista, id_usuario]
    );

    if (lista.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada.' });
    }

    // os registros em TB_Lista_Filme somem automaticamente por causa do ON DELETE CASCADE
    await pool.query('DELETE FROM TB_Lista WHERE id_lista = ?', [id_lista]);

    res.json({ message: 'Lista deletada com sucesso!' });
  } catch (err) {
    console.error('Erro ao deletar lista:', err.message);
    res.status(500).json({ error: 'Erro ao deletar lista.' });
  }
};

module.exports = {
  criarLista,
  listarMinhasListas,
  adicionarFilme,
  verFilmesDaLista,
  marcarAssistido,
  removerFilmeDaLista,
  editarLista,
  deletarLista,
};