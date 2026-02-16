const express = require('express');
const { authenticate } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// Test email endpoint (protected - only authenticated users)
router.post('/test', authenticate, async (req, res) => {
  try {
    const { to, subject, message } = req.body;

    if (!to) {
      return res.status(400).json({ message: 'Destinatário (to) é obrigatório.' });
    }

    await emailService.sendNotificationEmail(
      to,
      subject || 'Email de Teste - Sistema Indicadores',
      message || '<p>Este é um email de teste do Sistema Indicadores.</p>',
      req.user.name
    );

    return res.json({ message: 'Email enviado com sucesso!' });
  } catch (error) {
    console.error('Test email error:', error);
    return res.status(500).json({
      message: 'Erro ao enviar email.',
      error: error.message
    });
  }
});

// Send custom email (admin only - you might want to add admin check middleware)
router.post('/send', authenticate, async (req, res) => {
  try {
    const { to, subject, text, html } = req.body;

    if (!to || !subject) {
      return res.status(400).json({
        message: 'Destinatário (to) e assunto (subject) são obrigatórios.'
      });
    }

    if (!text && !html) {
      return res.status(400).json({
        message: 'O email deve conter texto (text) ou HTML (html).'
      });
    }

    const result = await emailService.sendEmail({ to, subject, text, html });

    return res.json({
      message: 'Email enviado com sucesso!',
      messageId: result.messageId
    });
  } catch (error) {
    console.error('Send email error:', error);
    return res.status(500).json({
      message: 'Erro ao enviar email.',
      error: error.message
    });
  }
});

module.exports = router;
