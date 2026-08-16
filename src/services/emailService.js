const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Monta o HTML padrão dos emails transacionais do CineTrack,
 * reaproveitado tanto na verificação de cadastro quanto na recuperação de senha.
 */
function montarTemplateCodigo({ nome, codigo, titulo, mensagem }) {
  return `
    <div style="background-color:#121212; padding:40px 20px; font-family: Arial, sans-serif;">
      <div style="max-width:400px; margin:0 auto; background-color:#1C1C1C; border:1px solid #2A2A2A; border-radius:8px; padding:32px;">
        <h1 style="color:#ECECEC; font-size:24px; margin:0 0 8px;">CineTrack</h1>
        <p style="color:#8C8C8C; font-size:14px; margin:0 0 24px;">Sua central de avaliações de filmes</p>

        <p style="color:#ECECEC; font-size:15px; margin:0 0 4px; font-weight:bold;">${titulo}</p>
        <p style="color:#ECECEC; font-size:15px; margin:0 0 8px;">Olá, ${nome}!</p>
        <p style="color:#8C8C8C; font-size:14px; margin:0 0 24px;">${mensagem}</p>

        <div style="background-color:#121212; border:1px solid #2A2A2A; border-radius:8px; padding:20px; text-align:center; margin-bottom:24px;">
          <span style="color:#E8A33D; font-size:32px; font-weight:bold; letter-spacing:6px; font-family: 'Courier New', monospace;">
            ${codigo}
          </span>
        </div>

        <p style="color:#8C8C8C; font-size:12px; margin:0;">
          Se você não solicitou isso, pode ignorar este email com segurança.
        </p>
      </div>
    </div>
  `;
}

async function enviarEmail({ to, subject, html }) {
  const resultado = await resend.emails.send({
    from: 'CineTrack <onboarding@resend.dev>',
    to,
    subject,
    html,
  });

  // o SDK do Resend não lança exceção em erro de API — ele retorna
  // { data, error }. Sem essa checagem, um envio recusado passaria
  // despercebido e a rota responderia "sucesso" de qualquer forma.
  if (resultado.error) {
    throw new Error(`Falha ao enviar email: ${resultado.error.message}`);
  }

  return resultado.data;
}

/**
 * Envia o código de verificação de 6 dígitos para confirmar o cadastro.
 */
async function enviarCodigoVerificacao(email, nome, codigo) {
  const html = montarTemplateCodigo({
    nome,
    codigo,
    titulo: 'Confirme seu email',
    mensagem: 'Use o código abaixo para confirmar seu email. Ele expira em 15 minutos.',
  });

  return enviarEmail({ to: email, subject: 'Confirme seu email · CineTrack', html });
}

/**
 * Envia o código de 6 dígitos para redefinição de senha.
 */
async function enviarCodigoRecuperacao(email, nome, codigo) {
  const html = montarTemplateCodigo({
    nome,
    codigo,
    titulo: 'Redefinição de senha',
    mensagem: 'Use o código abaixo para criar uma nova senha. Ele expira em 15 minutos.',
  });

  return enviarEmail({ to: email, subject: 'Redefinir senha · CineTrack', html });
}

module.exports = { enviarCodigoVerificacao, enviarCodigoRecuperacao };