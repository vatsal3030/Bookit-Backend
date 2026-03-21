import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_DO_NOT_USE_IN_PROD';

export const signToken = (payload: object, expiresIn = '7d') => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: expiresIn as any });
};

export const verifyToken = (token: string) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};
