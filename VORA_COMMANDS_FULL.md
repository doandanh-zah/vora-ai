# VORA Commands For End Users

## 1) Cai dat nhanh (khuyen nghi)

### One liner install (Recommended)

**macOS / Linux:**
```bash
curl -fsSL https://heyvora.fun/install.sh | bash
```

**Windows PowerShell:**
```powershell
iwr -useb https://heyvora.fun/install.ps1 | iex
```

**Windows WSL (Windows Subsystem for Linux):**
```bash
curl -fsSL https://heyvora.fun/install.sh | bash
```

⚠️ **Important:** After installation, open a NEW PowerShell window and run:
```powershell
vora --version
```

### Manual install (Alternative)

**macOS / Linux / WSL:**

```bash
npm i -g vora-ai
vora --version
```

**Windows PowerShell:**

```powershell
npm i -g vora-ai
vora --version
```

## 2) Kiem tra cai dat

### Tat ca he

```bash
vora --version
vora --help
```

### Kiem tra binary path

macOS / Linux / WSL:

```bash
which vora
```

Windows CMD:

```bat
where vora
```

Windows PowerShell:

```powershell
Get-Command vora
```

## 3) Cac lenh user da test (2026-04-03)

### Doctor

```bash
vora doctor
vora doctor --non-interactive --yes
```

### Configure (interactive wizard)

```bash
vora configure
```

Chay nhanh dung section:

```bash
vora configure --section gateway
```

### Models

```bash
vora models list
vora models status --json
```

### Gateway (install / start / restart)

Dat mode local truoc:

```bash
vora config set gateway.mode local
```

Cai service + start + status + restart:

```bash
vora gateway install --force
vora gateway start
vora gateway status
vora gateway restart
vora gateway status
```

Neu bi dung cong `18789` (xung dot voi process khac), chay cong rieng:

```bash
vora gateway --port 19001 install --force
vora gateway --port 19001 start
vora gateway --port 19001 status
vora gateway --port 19001 restart
```

## 4) Cap nhat len ban moi nhat

```bash
npm i -g vora-ai@latest
vora --version
```

## 5) Cai 1 version cu the

```bash
npm i -g vora-ai@0.1.2
vora --version
```

## 6) Go cai dat

```bash
npm uninstall -g vora-ai
```

Kiem tra da go:

```bash
vora --version
```

Neu go thanh cong, lenh tren se bao `command not found` (hoac tuong duong).

## 7) Cai lai sach (khi bi loi)

```bash
npm uninstall -g vora-ai
npm cache clean --force
npm i -g vora-ai
vora --version
```

## 8) Cai tu file `.tgz` (fallback)

### macOS / Linux / WSL

```bash
npm i -g --force /path/to/vora-ai-0.1.17.tgz
vora --version
```

### Windows PowerShell

```powershell
npm i -g --force "C:\path\to\vora-ai-0.1.17.tgz"
vora --version
```

## 9) Troubleshooting nhanh

### Loi `vora: command not found`

```bash
npm ls -g --depth=0 vora-ai
```

Neu thay da cai ma van khong chay, mo terminal moi roi thu lai:

```bash
vora --version
```

### Kiem tra Node version

```bash
node --version
```

VORA yeu cau Node `>=22.14.0`.

Neu dung `nvm`:

```bash
nvm install 22
nvm use 22
nvm alias default 22
```

### Loi gateway `device signature invalid` hoac status fail

```bash
vora gateway status --deep
vora doctor
```

Neu van fail do conflict cong:

```bash
vora gateway --port 19001 install --force
vora gateway --port 19001 restart
vora gateway --port 19001 status
```

## 10) Ollama Setup (FREE AI - Recommended for beginners)

### Auto-install (Recommended for non-tech users)

```bash
vora configure
# Select "Ollama (Local/Free)"
# Answer Y/n to auto-install and pull model
# Open new terminal: ollama serve
```

### Manual setup (Advanced users)

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Start server
ollama serve

# Pull model (choose one)
ollama pull llama3.2        # All-purpose
ollama pull qwen2.5:7b      # Great for coding
ollama pull deepseek-coder  # Code specialist

# Configure VORA
vora configure
# Select "Ollama (Local/Free)"
# Choose your model
```

### Verify Ollama setup

```bash
# Check Ollama status
ollama list

# Check VORA models
vora models list

# Test connection
vora models status --probe --probe-provider ollama
```

## 11) Lenh nhanh 1 dong (heyvora.fun)

### Install with heyvora.fun (Recommended)

**macOS / Linux:**
```bash
curl -fsSL https://heyvora.fun/install.sh | bash
```

**Windows PowerShell:**
```powershell
iwr -useb https://heyvora.fun/install.ps1 | iex
```

### Install + Configure with Ollama (All-in-one)

**macOS / Linux:**
```bash
curl -fsSL https://heyvora.fun/install.sh | bash && vora configure && echo "Select 'Ollama (Local/Free)' for FREE AI setup"
```

**Windows PowerShell:**
```powershell
iwr -useb https://heyvora.fun/install.ps1 | iex; vora configure; Write-Host "Select 'Ollama (Local/Free)' for FREE AI setup"
```

**Windows WSL:**
```bash
curl -fsSL https://heyvora.fun/install.sh | bash && vora configure && echo "Select 'Ollama (Local/Free)' for FREE AI setup"
```

⚠️ **Note:** This may fail if `vora` isn't in PATH yet. If so, open NEW PowerShell after install and run `vora configure` separately.

## 12) Ghi chu

- Day la tai lieu cho nguoi dung cuoi, khong bao gom lenh publish/build noi bo.
- Package install chuan: `vora-ai`.
- Latest version: `0.1.17` (supports auto-install Ollama).
- Ollama is FREE and runs locally - perfect for privacy and cost savings.
