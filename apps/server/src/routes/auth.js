const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const usersRepository = require('../db/usersRepository');
const { authenticate, generateToken } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../services/emailService');

const router = express.Router();
const SALT_ROUNDS = 10;

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
    }

    const user = await usersRepository.findByEmail(email.toLowerCase().trim());
    if (!user || !user.active) {
      return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'E-mail ou senha inválidos.' });
    }

    const token = generateToken(user);
    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await usersRepository.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }
    return res.json(user);
  } catch (error) {
    console.error('Me error:', error);
    return res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'E-mail é obrigatório.' });
    }

    const user = await usersRepository.findByEmail(email.toLowerCase().trim());
    if (user && user.active) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000);

      await usersRepository.setResetToken(user.id, tokenHash, expires);

      console.log('Sending password reset email to:', user.email);
      try {
        await sendPasswordResetEmail(user.email, rawToken, user.name);
        console.log('Password reset email sent successfully');
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError.message);
        console.error('Full error:', emailError);
      }
    }

    return res.json({ message: 'Se o e-mail existir, enviaremos instruções de recuperação.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: 'Token e nova senha são obrigatórios.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await usersRepository.findByResetToken(tokenHash);
    if (!user) {
      return res.status(400).json({ message: 'Token inválido ou expirado.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await usersRepository.updatePassword(user.id, passwordHash);
    await usersRepository.clearResetToken(user.id);

    return res.json({ message: 'Senha alterada com sucesso.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

module.exports = router;
