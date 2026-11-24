const jwt = require('jsonwebtoken');

/**
 * Gera o JWT da sessão. Além dos 3 campos que o frontend lê (id_usuario, nm_usuario,
 * ds_email), leva a "versao" do token: se ela não for igual à nr_versao_token que está no
 * banco, o authMiddleware recusa o token. Para derrubar todas as sessões de um usuário,
 * basta incrementar nr_versao_token no banco.
 * O objeto "usuario" precisa ter nr_versao_token (qualquer SELECT * em TB_Usuario já traz).
 */
function gerarToken(usuario) {
  return jwt.sign(
    {
      id_usuario: usuario.id_usuario,
      nm_usuario: usuario.nm_usuario,
      ds_email: usuario.ds_email,
      versao: Number(usuario.nr_versao_token) || 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { gerarToken };