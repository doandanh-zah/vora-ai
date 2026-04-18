import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const FILES = {
  users: "users.json",
  sessions: "sessions.json",
  actions: "actions.json",
  ledger: "ledger.json",
  intents: "payment-intents.json",
};

function nowIso() {
  return new Date().toISOString();
}

function withId(payload) {
  return { id: crypto.randomUUID(), createdAt: nowIso(), ...payload };
}

export function buildPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export class BackendStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    await Promise.all(Object.values(FILES).map((f) => this.#ensureFile(f)));
  }

  async #ensureFile(file) {
    const p = path.join(this.dataDir, file);
    try {
      await fs.access(p);
    } catch {
      await fs.writeFile(p, "[]\n", "utf8");
    }
  }

  async #read(file) {
    const p = path.join(this.dataDir, file);
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw || "[]");
  }

  async #write(file, data) {
    const p = path.join(this.dataDir, file);
    await fs.writeFile(p, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  async countUsers() {
    const users = await this.#read(FILES.users);
    return users.length;
  }

  async createUser({ email, name, passwordHash, role }) {
    const users = await this.#read(FILES.users);
    if (users.find((u) => u.email === email)) throw new Error("EMAIL_ALREADY_EXISTS");
    const user = withId({ email, name, passwordHash, role });
    users.push(user);
    await this.#write(FILES.users, users);
    return user;
  }

  async findUserByEmail(email) {
    const users = await this.#read(FILES.users);
    return users.find((u) => u.email === email) || null;
  }

  async findUserById(id) {
    const users = await this.#read(FILES.users);
    return users.find((u) => u.id === id) || null;
  }

  async createSession(payload) {
    const sessions = await this.#read(FILES.sessions);
    const s = withId({ revokedAt: null, ...payload });
    sessions.push(s);
    await this.#write(FILES.sessions, sessions);
    return s;
  }

  async findValidSessionByRefreshToken(refreshToken) {
    const sessions = await this.#read(FILES.sessions);
    const now = Date.now();
    return (
      sessions.find(
        (s) =>
          s.refreshToken === refreshToken &&
          !s.revokedAt &&
          Date.parse(s.expiresAt || 0) > now,
      ) || null
    );
  }

  async rotateSessionToken({ sessionId, refreshToken, expiresAt }) {
    const sessions = await this.#read(FILES.sessions);
    const idx = sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) return false;
    sessions[idx].refreshToken = refreshToken;
    sessions[idx].expiresAt = expiresAt;
    sessions[idx].updatedAt = nowIso();
    await this.#write(FILES.sessions, sessions);
    return true;
  }

  async revokeSessionByRefreshToken(refreshToken) {
    const sessions = await this.#read(FILES.sessions);
    const idx = sessions.findIndex((s) => s.refreshToken === refreshToken && !s.revokedAt);
    if (idx === -1) return false;
    sessions[idx].revokedAt = nowIso();
    await this.#write(FILES.sessions, sessions);
    return true;
  }

  async addAction(payload) {
    const actions = await this.#read(FILES.actions);
    const action = withId({ status: "ok", ...payload });
    actions.push(action);
    await this.#write(FILES.actions, actions);
    return action;
  }

  async listActionsByUser(userId, limit = 100) {
    const actions = await this.#read(FILES.actions);
    return actions.filter((a) => a.userId === userId).slice(-limit).reverse();
  }

  async listAllActions(limit = 200) {
    const actions = await this.#read(FILES.actions);
    return actions.slice(-limit).reverse();
  }

  async addLedgerEntry(payload) {
    const ledger = await this.#read(FILES.ledger);
    const entry = withId(payload);
    ledger.push(entry);
    await this.#write(FILES.ledger, ledger);
    return entry;
  }

  async listLedgerByUser(userId, limit = 100) {
    const ledger = await this.#read(FILES.ledger);
    return ledger.filter((e) => e.userId === userId).slice(-limit).reverse();
  }

  async getUserBalance(userId) {
    const ledger = await this.#read(FILES.ledger);
    return ledger.filter((e) => e.userId === userId).reduce((s, e) => s + Number(e.amount || 0), 0);
  }

  async createPaymentIntent(payload) {
    const intents = await this.#read(FILES.intents);
    const intent = withId({ status: "pending", ...payload });
    intents.push(intent);
    await this.#write(FILES.intents, intents);
    return intent;
  }

  async getPaymentIntentById(id) {
    const intents = await this.#read(FILES.intents);
    return intents.find((i) => i.id === id) || null;
  }

  async markPaymentIntentConfirmed({ intentId, txSignature }) {
    const intents = await this.#read(FILES.intents);
    const idx = intents.findIndex((i) => i.id === intentId);
    if (idx === -1) return null;
    intents[idx].status = "confirmed";
    intents[idx].confirmedAt = nowIso();
    intents[idx].txSignature = txSignature;
    await this.#write(FILES.intents, intents);
    return intents[idx];
  }
}
