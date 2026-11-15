const pool = require('../config/database');

// Aceita apenas data URL de imagem em base64 (o front sempre envia JPEG 256x256)
const FORMATO_FOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const TAMANHO_MAXIMO_FOTO = 150000; // caracteres (~110 KB de imagem)

// GET /usuarios/me
const obterMeuPerfil = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id_usuario, nm_usuario, ds_email, ds_foto FROM TB_Usuario WHERE id_usuario = ?',
      [req.usuario.id_usuario]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao buscar perfil:', err.message);
    res.status(500).json({ error: 'Erro ao buscar perfil.' });
  }
};

// PUT /usuarios/foto
const atualizarFoto = async (req, res) => {
  const { ds_foto } = req.body;

  if (typeof ds_foto !== 'string' || !ds_foto) {
    return res.status(400).json({ error: 'Envie uma imagem.' });
  }

  if (ds_foto.length > TAMANHO_MAXIMO_FOTO) {
    return res.status(400).json({ error: 'A imagem é grande demais.' });
  }

  if (!FORMATO_FOTO.test(ds_foto)) {
    return res.status(400).json({ error: 'Formato de imagem inválido. Use JPEG, PNG ou WebP.' });
  }

  try {
    await pool.query(
      'UPDATE TB_Usuario SET ds_foto = ? WHERE id_usuario = ?',
      [ds_foto, req.usuario.id_usuario]
    );

    res.json({ message: 'Foto atualizada com sucesso!' });
  } catch (err) {
    console.error('Erro ao atualizar foto:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar foto.' });
  }
};

// DELETE /usuarios/foto
const removerFoto = async (req, res) => {
  try {
    await pool.query(
      'UPDATE TB_Usuario SET ds_foto = NULL WHERE id_usuario = ?',
      [req.usuario.id_usuario]
    );

    res.json({ message: 'Foto removida com sucesso!' });
  } catch (err) {
    console.error('Erro ao remover foto:', err.message);
    res.status(500).json({ error: 'Erro ao remover foto.' });
  }
};

module.exports = { obterMeuPerfil, atualizarFoto, removerFoto };