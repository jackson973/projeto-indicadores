const express = require('express');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const { authenticate, generateToken } = require('../middleware/auth');
const usersRepository = require('../db/usersRepository');
const webauthnRepo = require('../db/webauthnRepository');

const router = express.Router();

const RP_NAME = 'Indicadores';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const RP_ORIGIN = process.env.WEBAUTHN_RP_ORIGIN || 'http://localhost:5173';

// ── Registration (requires auth) ────────────────────────────────────────────

router.post('/register/options', authenticate, async (req, res) => {
  try {
    const user = await usersRepository.findById(req.user.id);
    const existingCreds = await webauthnRepo.findByUserId(user.id);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new TextEncoder().encode(String(user.id)),
      userName: user.email,
      userDisplayName: user.name || user.email,
      excludeCredentials: existingCreds.map(c => ({
        id: c.id,
        transports: c.transports || [],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await webauthnRepo.setChallenge(user.id, options.challenge);
    res.json(options);
  } catch (err) {
    console.error('WebAuthn register/options error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/register/verify', authenticate, async (req, res) => {
  try {
    const challenge = await webauthnRepo.getChallenge(req.user.id);
    if (!challenge) return res.status(400).json({ message: 'Challenge expirado.' });

    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: challenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ message: 'Verificação falhou.' });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    await webauthnRepo.create({
      id: credential.id,
      userId: req.user.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: req.body.response?.transports || [],
    });

    res.json({ verified: true });
  } catch (err) {
    console.error('WebAuthn register/verify error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── Authentication (public) ─────────────────────────────────────────────────

router.post('/authenticate/options', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'E-mail é obrigatório.' });

    const user = await usersRepository.findByEmail(email.toLowerCase().trim());
    if (!user || !user.active) {
      return res.status(400).json({ message: 'Usuário não encontrado.' });
    }

    const creds = await webauthnRepo.findByUserId(user.id);
    if (creds.length === 0) {
      return res.status(400).json({ message: 'Nenhuma biometria cadastrada.' });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: creds.map(c => ({
        id: c.id,
        transports: c.transports || [],
      })),
      userVerification: 'preferred',
    });

    await webauthnRepo.setChallenge(user.id, options.challenge);
    res.json(options);
  } catch (err) {
    console.error('WebAuthn authenticate/options error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/authenticate/verify', async (req, res) => {
  try {
    const { email, response: authResponse } = req.body;
    if (!email || !authResponse) {
      return res.status(400).json({ message: 'Dados incompletos.' });
    }

    const user = await usersRepository.findByEmail(email.toLowerCase().trim());
    if (!user || !user.active) {
      return res.status(400).json({ message: 'Usuário não encontrado.' });
    }

    const challenge = await webauthnRepo.getChallenge(user.id);
    if (!challenge) return res.status(400).json({ message: 'Challenge expirado.' });

    const credential = await webauthnRepo.findById(authResponse.id);
    if (!credential || credential.user_id !== user.id) {
      return res.status(400).json({ message: 'Credencial não encontrada.' });
    }

    const verification = await verifyAuthenticationResponse({
      response: authResponse,
      expectedChallenge: challenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: credential.id,
        publicKey: credential.public_key,
        counter: credential.counter,
        transports: credential.transports || [],
      },
    });

    if (!verification.verified) {
      return res.status(400).json({ message: 'Autenticação biométrica falhou.' });
    }

    await webauthnRepo.updateCounter(credential.id, verification.authenticationInfo.newCounter);

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('WebAuthn authenticate/verify error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── Credentials management (requires auth) ──────────────────────────────────

router.get('/credentials', authenticate, async (req, res) => {
  try {
    const creds = await webauthnRepo.findByUserId(req.user.id);
    res.json(creds.map(c => ({ id: c.id, createdAt: c.created_at })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/credentials/:id', authenticate, async (req, res) => {
  try {
    await webauthnRepo.remove(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
