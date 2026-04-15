import { verifyAccessToken } from "../lib/auth.js";

function parseBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== "string") {
    return null;
  }
  const [scheme, token] = authHeader.trim().split(" ");
  if (!scheme || !token) {
    return null;
  }
  if (scheme.toLowerCase() !== "bearer") {
    return null;
  }
  return token;
}

export function requireAuth(config) {
  return (req, res, next) => {
    try {
      const token = parseBearerToken(req.headers.authorization);
      if (!token) {
        res.status(401).json({ error: "Missing bearer token" });
        return;
      }
      const payload = verifyAccessToken(config, token);
      req.auth = {
        userId: String(payload.sub),
        role: String(payload.role || "user"),
        email: String(payload.email || ""),
      };
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired access token" });
    }
  };
}

export function requireAdmin(req, res, next) {
  if (!req.auth || req.auth.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }
  next();
}
