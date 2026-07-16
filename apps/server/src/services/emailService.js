const nodemailer = require('nodemailer');

const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// Create reusable transporter with Gmail configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'tuckkidsrobot@gmail.com',
    pass: 'zhcn viyd ubhy kukr'
  }
});

// Verify connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('Email service configuration error:', error);
  } else {
    console.log('Email service ready to send messages');
  }
});

/**
 * Send email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body (optional)
 * @param {string} options.html - HTML body (optional)
 * @param {string} options.from - Sender email (optional, defaults to configured Gmail)
 * @returns {Promise<Object>} - Nodemailer result
 */
async function sendEmail({ to, subject, text, html, from }) {
  const mailOptions = {
    from: from || 'Indicadores <tuckkidsrobot@gmail.com>',
    to,
    subject,
    text,
    html
  };

  try {
    console.log('Attempting to send email to:', to, 'subject:', subject);
    const result = await transporter.sendMail(mailOptions);
    console.log('✓ Email sent successfully to:', to, 'MessageId:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('✗ Email sending error:', error.message);
    console.error('Full error:', error);
    throw error;
  }
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(to, resetToken, userName) {
  const resetLink = `${APP_URL}/reset-password?token=${resetToken}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3182CE; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: #f7fafc; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 5px 5px; }
          .button { display: inline-block; background: #3182CE; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #718096; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Redefinição de Senha</h1>
          </div>
          <div class="content">
            <p>Olá${userName ? ` ${userName}` : ''},</p>
            <p>Recebemos uma solicitação para redefinir a senha da sua conta no sistema Indicadores.</p>
            <p>Clique no botão abaixo para redefinir sua senha:</p>
            <p style="text-align: center;">
              <a href="${resetLink}" class="button">Redefinir Senha</a>
            </p>
            <p>Ou copie e cole este link no seu navegador:</p>
            <p style="word-break: break-all; color: #3182CE;">${resetLink}</p>
            <p><strong>Este link expira em 1 hora.</strong></p>
            <p>Se você não solicitou esta redefinição, ignore este email. Sua senha permanecerá inalterada.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Sistema Indicadores. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
Olá${userName ? ` ${userName}` : ''},

Recebemos uma solicitação para redefinir a senha da sua conta no sistema Indicadores.

Acesse o link abaixo para redefinir sua senha:
${resetLink}

Este link expira em 1 hora.

Se você não solicitou esta redefinição, ignore este email. Sua senha permanecerá inalterada.

---
© ${new Date().getFullYear()} Sistema Indicadores
  `;

  return sendEmail({
    to,
    subject: 'Redefinição de Senha - Sistema Indicadores',
    text,
    html
  });
}

/**
 * Send welcome email to new user
 */
async function sendWelcomeEmail(to, userName, tempPassword) {
  const loginUrl = APP_URL;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #48BB78; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: #f7fafc; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 5px 5px; }
          .credentials { background: white; padding: 15px; border-left: 4px solid #3182CE; margin: 20px 0; }
          .button { display: inline-block; background: #48BB78; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #718096; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Bem-vindo ao Sistema Indicadores!</h1>
          </div>
          <div class="content">
            <p>Olá ${userName},</p>
            <p>Sua conta foi criada com sucesso no Sistema Indicadores.</p>
            <p>Use as credenciais abaixo para fazer login:</p>
            <div class="credentials">
              <p><strong>Email:</strong> ${to}</p>
              <p><strong>Senha temporária:</strong> ${tempPassword}</p>
            </div>
            <p><strong>⚠️ Importante:</strong> Por questões de segurança, recomendamos que você altere sua senha após o primeiro login.</p>
            <p style="text-align: center;">
              <a href="${loginUrl}" class="button">Acessar Sistema</a>
            </p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Sistema Indicadores. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
Bem-vindo ao Sistema Indicadores!

Olá ${userName},

Sua conta foi criada com sucesso no Sistema Indicadores.

Use as credenciais abaixo para fazer login:
Email: ${to}
Senha temporária: ${tempPassword}

⚠️ Importante: Por questões de segurança, recomendamos que você altere sua senha após o primeiro login.

Acesse o sistema em: ${loginUrl}

---
© ${new Date().getFullYear()} Sistema Indicadores
  `;

  return sendEmail({
    to,
    subject: 'Bem-vindo ao Sistema Indicadores',
    text,
    html
  });
}

/**
 * Send notification email
 */
async function sendNotificationEmail(to, subject, message, userName) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3182CE; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: #f7fafc; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 5px 5px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #718096; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Sistema Indicadores</h1>
          </div>
          <div class="content">
            <p>Olá${userName ? ` ${userName}` : ''},</p>
            ${message}
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Sistema Indicadores. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to,
    subject,
    html,
    text: message.replace(/<[^>]*>/g, '') // Strip HTML tags for plain text version
  });
}

// Helper functions
function formatDateBR(dateStr) {
  // Datas do pg chegam como objeto Date; strings como 'YYYY-MM-DD'
  if (dateStr instanceof Date) {
    const d = String(dateStr.getDate()).padStart(2, '0');
    const m = String(dateStr.getMonth() + 1).padStart(2, '0');
    return `${d}/${m}/${dateStr.getFullYear()}`;
  }
  const [y, m, d] = String(dateStr ?? '').slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function formatCurrency(value) {
  return (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Send daily cashflow alerts email
 */
async function sendCashflowAlertsEmail(to, userName, alertsData) {
  const { boxes, today } = alertsData;

  let boxesHtml = '';

  for (const boxData of boxes) {
    const { box, overdueItems, overdueCount, overdueTotal, upcomingItems, upcomingCount, upcomingTotal } = boxData;

    boxesHtml += `
      <div style="margin-bottom: 30px; padding: 20px; background: #f7fafc; border-radius: 8px; border-left: 4px solid #3182CE;">
        <h3 style="margin: 0 0 15px 0; color: #2D3748;">${box.name}</h3>
    `;

    // Overdue section
    if (overdueCount > 0) {
      boxesHtml += `
        <div style="margin-bottom: 20px;">
          <h4 style="color: #E53E3E; margin: 0 0 10px 0;">
            ⚠️ Vencidos: ${overdueCount} despesa(s) - Total: ${formatCurrency(overdueTotal)}
          </h4>
          <table style="width: 100%; border-collapse: collapse; background: white;">
            <thead>
              <tr style="background: #FED7D7;">
                <th style="padding: 8px; text-align: left; border: 1px solid #FC8181;">Data</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #FC8181;">Categoria</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #FC8181;">Descrição</th>
                <th style="padding: 8px; text-align: right; border: 1px solid #FC8181;">Valor</th>
              </tr>
            </thead>
            <tbody>
      `;

      for (const item of overdueItems) {
        boxesHtml += `
          <tr>
            <td style="padding: 8px; border: 1px solid #FEB2B2;">${formatDateBR(item.date)}</td>
            <td style="padding: 8px; border: 1px solid #FEB2B2;">${item.categoryName}</td>
            <td style="padding: 8px; border: 1px solid #FEB2B2;">${item.description}</td>
            <td style="padding: 8px; text-align: right; border: 1px solid #FEB2B2; font-weight: bold; color: #E53E3E;">
              ${formatCurrency(item.amount)}
            </td>
          </tr>
        `;
      }
      boxesHtml += `</tbody></table></div>`;
    }

    // Upcoming section
    if (upcomingCount > 0) {
      boxesHtml += `
        <div>
          <h4 style="color: #3182CE; margin: 0 0 10px 0;">
            📅 A Vencer: ${upcomingCount} despesa(s) - Total: ${formatCurrency(upcomingTotal)}
          </h4>
          <table style="width: 100%; border-collapse: collapse; background: white;">
            <thead>
              <tr style="background: #BEE3F8;">
                <th style="padding: 8px; text-align: left; border: 1px solid #63B3ED;">Data</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #63B3ED;">Categoria</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #63B3ED;">Descrição</th>
                <th style="padding: 8px; text-align: right; border: 1px solid #63B3ED;">Valor</th>
              </tr>
            </thead>
            <tbody>
      `;

      for (const item of upcomingItems) {
        boxesHtml += `
          <tr>
            <td style="padding: 8px; border: 1px solid #90CDF4;">${formatDateBR(item.date)}</td>
            <td style="padding: 8px; border: 1px solid #90CDF4;">${item.categoryName}</td>
            <td style="padding: 8px; border: 1px solid #90CDF4;">${item.description}</td>
            <td style="padding: 8px; text-align: right; border: 1px solid #90CDF4; font-weight: bold; color: #3182CE;">
              ${formatCurrency(item.amount)}
            </td>
          </tr>
        `;
      }
      boxesHtml += `</tbody></table></div>`;
    }

    boxesHtml += '</div>';
  }

  if (boxes.length === 0) {
    boxesHtml = `
      <div style="padding: 40px; text-align: center; color: #48BB78;">
        <h3>✓ Nenhuma despesa pendente!</h3>
        <p>Todos os pagamentos estão em dia.</p>
      </div>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { background: #3182CE; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: white; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 5px 5px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #718096; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Relatório Diário de Fluxo de Caixa</h1>
            <p style="margin: 5px 0 0 0;">Despesas Pendentes - ${formatDateBR(today)}</p>
          </div>
          <div class="content">
            <p>Olá ${userName},</p>
            <p>Segue o resumo das despesas pendentes que requerem atenção:</p>
            ${boxesHtml}
            <p style="text-align: center; margin-top: 30px;">
              <a href="${APP_URL}" style="display: inline-block; background: #3182CE; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">Acessar o Sistema</a>
            </p>
            <p style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 14px;">
              Este é um email automático enviado diariamente às 01:00 AM.<br>
              Para marcar despesas como pagas, acesse o sistema.
            </p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Sistema Indicadores. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `📊 Fluxo de Caixa - Alertas do dia ${formatDateBR(today)}`,
    text: `Relatório Diário - ${formatDateBR(today)}`,
    html
  });
}

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendNotificationEmail,
  sendCashflowAlertsEmail
};
