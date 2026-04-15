# VORA Backend (Auth + Action Logs + Credits + Solana Scaffold)

Backend service for:
- user login/register/refresh/logout
- per-user action tracking
- credit ledger management
- Solana payment intent + confirmation flow

## 1) Setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Default server: `http://127.0.0.1:8788`

## 2) Required env for stable auth

Set strong secrets in `.env`:

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

For Solana intents:

- `SOLANA_RECEIVER_ADDRESS` (wallet that receives user payment)
- `SOLANA_CLUSTER` (`devnet`, `mainnet-beta`, or custom RPC URL)
- `SOLANA_VERIFY_ONCHAIN=true` for strict on-chain verification

## 3) API overview

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Actions

- `POST /api/actions`
- `GET /api/actions/mine`
- `GET /api/actions/all` (admin only)

### Credits

- `GET /api/credits/balance`
- `GET /api/credits/ledger`
- `POST /api/credits/spend`
- `POST /api/credits/grant` (admin only)

### Solana Payments

- `POST /api/payments/solana/intents`
- `GET /api/payments/solana/intents/:intentId`
- `POST /api/payments/solana/confirm`

## 4) Quick test flow

### Register

```bash
curl -sS -X POST http://127.0.0.1:8788/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"zah@example.com","password":"StrongPass123!","name":"Zah"}'
```

Save `accessToken` and `refreshToken` from response.

### Balance

```bash
curl -sS http://127.0.0.1:8788/api/credits/balance \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### Create action log

```bash
curl -sS -X POST http://127.0.0.1:8788/api/actions \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H 'Content-Type: application/json' \
  -d '{"type":"voice.command","status":"ok","metadata":{"source":"terminal"}}'
```

### Create Solana payment intent

```bash
curl -sS -X POST http://127.0.0.1:8788/api/payments/solana/intents \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H 'Content-Type: application/json' \
  -d '{"credits":100,"walletAddress":"<USER_WALLET_ADDRESS>"}'
```

### Confirm Solana payment

```bash
curl -sS -X POST http://127.0.0.1:8788/api/payments/solana/confirm \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H 'Content-Type: application/json' \
  -d '{"intentId":"<INTENT_ID>","txSignature":"<SOLANA_TX_SIGNATURE>"}'
```

## 5) Data model (local MVP)

Local JSON files under `DATA_DIR`:

- `users.json`
- `sessions.json`
- `actions.json`
- `ledger.json`
- `payment-intents.json`

This is a fast MVP store for local/dev. You can later migrate to Postgres without changing API contract.

## 6) Integration note for VORA app

For release build, client app should call this backend for payment/session state.
Do not expose Agora/Solana private keys in client bundles.
