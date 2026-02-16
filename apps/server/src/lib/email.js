const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const FROM_EMAIL = process.env.SMTP_FROM || 'noreply@indicadores.local';

async function sendResetEmail(toEmail, userName, rawToken) {
  const resetUrl = `${APP_URL}?reset_token=${rawToken}`;

  const html = `
    <h2>Recuperação de senha</h2>
    <p>Olá ${userName},</p>
    <p>Recebemos uma solicitação para redefinir sua senha.</p>
    <p>Clique no link abaixo para criar uma nova senha:</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>Este link expira em 1 hora.</p>
    <p>Se você não solicitou esta alteração, ignore este e-mail.</p>
  `;

  try {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: toEmail,
      subject: 'Recuperação de senha - Indicadores',
      html
    });
    console.log('Reset email sent to', toEmail);
  } catch (error) {
    console.error('Failed to send reset email:', error.message);
    console.log('Reset token for', toEmail, ':', rawToken);
  }
}

module.exports = { sendResetEmail };
