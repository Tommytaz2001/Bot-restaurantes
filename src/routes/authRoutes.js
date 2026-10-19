const { Router } = require('express');
const { loginUser } = require('../services/authService');

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await loginUser(email, password);
    res.json(result);
  } catch (err) {
    console.error('[POST /auth/login]', err.message);
    res.status(401).json({ error: err.message });
  }
});

module.exports = router;
