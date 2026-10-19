const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'urbano_jwt_secret_super_seguro_2026';
const JWT_EXPIRES_IN = '30d';

async function loginUser(email, password) {
  if (!email || !password) {
    throw new Error('Email y contraseña son requeridos');
  }

  const res = await query('SELECT * FROM usuarios WHERE email = $1', [email.trim().toLowerCase()]);
  if (res.rows.length === 0) {
    throw new Error('Credenciales inválidas');
  }

  const user = res.rows[0];
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw new Error('Credenciales inválidas');
  }

  const token = jwt.sign(
    {
      uid: user.id,
      email: user.email,
      rol: user.rol,
      restauranteId: user.restaurante_id,
      nombre: user.nombre,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      rol: user.rol,
      restauranteId: user.restaurante_id,
      nombre: user.nombre,
    },
  };
}

module.exports = {
  loginUser,
  JWT_SECRET,
};
