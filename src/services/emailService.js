const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Envia o código de verificação de 6 dígitos para o email do usuário recém-cadastrado.
 */
async function enviarCodigoVerificacao(email, nome, codigo) {
  await resend.emails.send({
    from: 'CineTrack <onboarding@resend.dev>',
    to: email,
    subject: 'Confirme seu email · CineTrack',
    html: `
      <div style="background-color:#121212; padding:40px 20px; font-family: Arial, sans-serif;">
        <div style="max-width:400px; margin:0 auto; background-color:#1C1C1C; border:1px solid #2A2A2A; border-radius:8px; padding:32px;">
          <h1 style="color:#ECECEC; font-size:24px; margin:0 0 8px;">CineTrack</h1>
          <p style="color:#8C8C8C; font-size:14px; margin:0 0 24px;">Sua central de avaliações de filmes</p>

          <p style="color:#ECECEC; font-size:15px; margin:0 0 8px;">Olá, ${nome}!</p>
          <p style="color:#8C8C8C; font-size:14px; margin:0 0 24px;">
            Use o código abaixo para confirmar seu email. Ele expira em 15 minutos.
          </p>

          <div style="background-color:#121212; border:1px solid #2A2A2A; border-radius:8px; padding:20px; text-align:center; margin-bottom:24px;">
            <span style="color:#E8A33D; font-size:32px; font-weight:bold; letter-spacing:6px; font-family: 'Courier New', monospace;">
              ${codigo}
            </span>
          </div>

          <p style="color:#8C8C8C; font-size:12px; margin:0;">
            Se você não criou uma conta no CineTrack, pode ignorar este email.
          </p>
        </div>
      </div>
    `,
  });
}

module.exports = { enviarCodigoVerificacao };