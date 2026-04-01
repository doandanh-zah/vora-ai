# VORA Command Reference (Install / Publish / Update / Uninstall)

## 0) Bien moi truong

```bash
# Repo local
REPO="/Users/doandothanhdanh/Desktop/ZAH_CODE/vora/vora-ai/vora-core"

# Package tren npm registry
PKG="vora-ai"

# Ban muc tieu hien tai
VER="0.1.1"
```

## 1) Build + smoke local truoc khi dong goi

```bash
cd "$REPO"
pnpm install --no-frozen-lockfile
pnpm build
node scripts/phase0-m2-tool-smoke.mjs
node scripts/phase0-m3-rebrand-audit.mjs
```

## 2) Pack local `.tgz`

```bash
cd "$REPO"
npm pack
```

Kiem tra output trong tarball:

```bash
tar -tf "$REPO/vora-ai-$VER.tgz" | rg '^package/dist/(index\.js|build-info\.json)$'
```

## 3) Cai dat cho user that (khuyen nghi)

```bash
npm i -g "$PKG"
vora --version
npm ls -g --depth=0 "$PKG"
```

## 4) Cai dat global tu file `.tgz` (fallback offline)

### macOS / Linux

```bash
npm i -g --force "$REPO/vora-ai-$VER.tgz"
```

### Windows PowerShell

```powershell
npm i -g --force "C:\path\to\vora-ai-0.1.1.tgz"
```

### WSL

```bash
npm i -g --force "/mnt/c/path/to/vora-ai-0.1.1.tgz"
```

## 5) Publish len npm

```bash
cd "$REPO"
npm whoami
npm publish --access public
```

Neu gap `E403 Two-factor authentication ... is required`:

```bash
# Dung granular token co bypass 2FA cho publish
read -s NPM_TOKEN
echo
npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN"
npm whoami
npm publish --access public
```

## 6) Kiem tra sau publish

```bash
npm view "$PKG" version dist-tags.latest
npm i -g "$PKG"
vora --version
which vora  # macOS/Linux/WSL
```

Windows:

```bat
where vora
```

## 7) Update / pin version

```bash
# update latest
npm i -g "$PKG@latest"

# pin 1 version cu the
npm i -g "$PKG@$VER"

vora --version
```

## 8) Uninstall + clean reinstall

```bash
npm uninstall -g "$PKG"
npm cache clean --force
npm i -g "$PKG"
vora --version
```

## 9) Chay truc tiep tu source (khong cai global)

```bash
cd "$REPO"
pnpm build
node vora.mjs --version
```

## 10) Troubleshooting nhanh

### `E403` khi publish

- Nguyen nhan thuong gap: account bat 2FA cho publish, nhung dang login bang web token khong co bypass 2FA.
- Cach fix: dung granular access token co quyen publish + bypass 2FA.

### CLI hien sai version (`0.0.0`)

```bash
vora --version
npm ls -g --depth=0 "$PKG"
```

Neu package da dung ma version van sai, go va cai lai:

```bash
npm uninstall -g "$PKG"
npm i -g "$PKG"
vora --version
```

### Kiem tra Node version

```bash
node --version
```

### Neu dung nvm

```bash
nvm install 22
nvm use 22
nvm alias default 22
```

## 11) Lenh nhanh all-in-one (macOS/Linux)

```bash
cd /Users/doandothanhdanh/Desktop/ZAH_CODE/vora/vora-ai/vora-core && pnpm install --no-frozen-lockfile && pnpm build && node scripts/phase0-m2-tool-smoke.mjs && node scripts/phase0-m3-rebrand-audit.mjs && npm publish --access public && npm i -g vora-ai && vora --version
```

## 12) Luu y bao mat

- Khong commit token vao repo.
- Neu lo token (paste chat/log), revoke token ngay trong npm account va tao token moi.
