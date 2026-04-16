import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function createAccessToken(config, user) {
  return jwt.sign(
    { role: user.role, email: user.email, name: user.name },
    config.auth.accessSecret,
    { subject: user.id, expiresIn: config.auth.accessExpiresIn },
  );
}

export function verifyAccessToken(config, token) {
  return jwt.verify(token, config.auth.accessSecret);
}

export function newRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

export function calcRefreshExpiryIso(config) {
  const days = Number(config.auth.refreshExpiresDays || 30);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
