const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const verificarToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  const partes = authHeader.split(' ');

  if (partes.length !== 2 || partes[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Token mal formatado.' });
  }

  let payload;
  try {
    payload = jwt.verify(partes[1], process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }

  try {
    // O token só vale se o usuário ainda existe e a versão dele é a mesma do banco.
    // Tokens emitidos antes deste recurso não têm "versao" e contam como 0 (o padrão da coluna).
    const [rows] = await pool.query(
      'SELECT nr_versao_token FROM TB_Usuario WHERE id_usuario = ?',
      [payload.id_usuario]
    );

    if (rows.length === 0 || Number(rows[0].nr_versao_token) !== (Number(payload.versao) || 0)) {
      return res.status(401).json({ error: 'Sessão encerrada. Faça login novamente.' });
    }
  } catch (err) {
    console.error('Erro ao validar a sessão:', err.message);
    return res.status(500).json({ error: 'Erro ao validar a sessão.' });
  }

  req.usuario = payload;
  next();
};

module.exports = verificarToken;