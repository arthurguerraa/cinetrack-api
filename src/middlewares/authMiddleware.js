const jwt = require('jsonwebtoken');

const verificarToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  // formato esperado: "Bearer <token>"
  const [, token] = authHeader.split(' ');

  if (!token) {
    return res.status(401).json({ error: 'Token mal formatado.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // guarda os dados do usuário na requisição pra usar nas próximas etapas
    req.usuario = payload;

    next(); // libera a passagem pra rota
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
};

module.exports = verificarToken;