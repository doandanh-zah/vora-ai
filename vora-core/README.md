# VORA Core CLI

`vora-ai` is the local CLI and gateway core for **VORA**, Zah's voice-first AI agent project.

This package provides the parts that run on the user's machine today:

- the `vora` CLI
- the local gateway/runtime
- onboarding and configuration flows
- model/provider setup
- local workspace + agent state

Phase 0 focus is simple local setup, stable defaults, and a clean base for the VORA desktop/app layers that will sit on top of this core.

## Install

Requirements:

- Node.js `22.14+`

Install from npm:

```bash
npm install -g vora-ai@latest
```

**One-liner (Mac/Linux):**

```bash
curl -fsSL https://heyvora.fun/install.sh | bash
```

**One-liner (Windows - PowerShell):**

```powershell
iwr -useb https://heyvora.fun/install.ps1 | iex
```

Install from a local tarball:

```bash
npm install -g ./vora-ai-<version>.tgz
```

Recommended first run:

```bash
vora onboard
```

## Gateway Default

VORA now uses this local gateway port by default:

```text
ws://127.0.0.1:27106
```

Start it manually if needed:

```bash
vora gateway --port 27106
```

For a background service, use:

```bash
vora onboard --install-daemon
```

## Model Setup

Current setup flows in this package include:

- OpenAI / OAuth-backed flows when configured
- local/free **Ollama** setup
- custom OpenAI-compatible or Anthropic-compatible providers

### Ollama (local/free)

If you want a free local model:

```bash
ollama serve
ollama pull qwen3:4b
vora onboard
```

Then choose **`Ollama (Local/Free)`** in the model/auth setup step.

VORA will configure a local `ollama` provider in your model config and use the model already pulled on your machine.

## Useful Commands

```bash
vora onboard
vora gateway --port 27106
vora configure
vora doctor
vora models
```

## Scope

This npm package is the **core runtime and CLI**, not the final end-user desktop shell.

Voice UX, wake-word UX, and the planned Agora/Tauri product layers are separate layers built on top of this core.

## Repository

- GitHub: `https://github.com/vora-ai/vora-core`
- License: `MIT`
