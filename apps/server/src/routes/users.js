const express = require('express');
const bcrypt = require('bcrypt');
const usersRepository = require('../db/usersRepository');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../services/emailService');

const router = express.Router();
const SALT_ROUNDS = 10;

router.use(authenticate, requireAdmin);

router.get('/', async (req, res) => {
  try {
    const users = await usersRepository.findAll();
    return res.json(users);
  } catch (error) {
    console.error('List users error:', error);
    return res.status(500).json({ message: 'Erro ao listar usuários.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, email, password, role, whatsapp } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Nome, e-mail e senha são obrigatórios.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    const existing = await usersRepository.findByEmail(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ message: 'Já existe um usuário com este e-mail.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await usersRepository.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role: role || 'user',
      whatsapp: whatsapp?.trim() || null
    });

    // Send welcome email with credentials
    try {
      await sendWelcomeEmail(user.email, user.name, password);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError.message);
      // Don't fail user creation if email fails
    }

    return res.status(201).json(user);
  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({ message: 'Erro ao criar usuário.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, email, role, active, whatsapp } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: 'Nome e e-mail são obrigatórios.' });
    }

    const user = await usersRepository.update(req.params.id, {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role: role || 'user',
      active: active !== undefined ? active : true,
      whatsapp: whatsapp?.trim() || null
    });
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }
    return res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({ message: 'Erro ao atualizar usuário.' });
  }
});

router.put('/:id/password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    const user = await usersRepository.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await usersRepository.updatePassword(req.params.id, passwordHash);
    return res.json({ message: 'Senha atualizada com sucesso.' });
  } catch (error) {
    console.error('Update password error:', error);
    return res.status(500).json({ message: 'Erro ao atualizar senha.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ message: 'Não é possível excluir seu próprio usuário.' });
    }

    const deleted = await usersRepository.remove(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }
    return res.json({ message: 'Usuário excluído com sucesso.' });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ message: 'Erro ao excluir usuário.' });
  }
});

module.exports = router;
