---
summary: "Uninstall Vora completely (CLI, service, state, workspace)"
read_when:
  - You want to remove Vora from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

# Uninstall

Two paths:

- **Easy path** if `vora` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
vora uninstall
```

Non-interactive (automation / npx):

```bash
vora uninstall --all --yes --non-interactive
npx -y vora uninstall --all --yes --non-interactive
```

Manual steps (same result):

1. Stop the gateway service:

```bash
vora gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
vora gateway uninstall
```

3. Delete state + config:

```bash
rm -rf "${VORA_STATE_DIR:-$HOME/.vora}"
```

If you set `VORA_CONFIG_PATH` to a custom location outside the state dir, delete that file too.

4. Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/.vora/workspace
```

5. Remove the CLI install (pick the one you used):

```bash
npm rm -g vora
pnpm remove -g vora
bun remove -g vora
```

6. If you installed the macOS app:

```bash
rm -rf /Applications/Vora.app
```

Notes:

- If you used profiles (`--profile` / `VORA_PROFILE`), repeat step 3 for each state dir (defaults are `~/.vora-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `vora` is missing.

### macOS (launchd)

Default label is `ai.vora.gateway` (or `ai.vora.<profile>`; legacy `com.vora.*` may still exist):

```bash
launchctl bootout gui/$UID/ai.vora.gateway
rm -f ~/Library/LaunchAgents/ai.vora.gateway.plist
```

If you used a profile, replace the label and plist name with `ai.vora.<profile>`. Remove any legacy `com.vora.*` plists if present.

### Linux (systemd user unit)

Default unit name is `vora-gateway.service` (or `vora-gateway-<profile>.service`):

```bash
systemctl --user disable --now vora-gateway.service
rm -f ~/.config/systemd/user/vora-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `Vora Gateway` (or `Vora Gateway (<profile>)`).
The task script lives under your state dir.

```powershell
schtasks /Delete /F /TN "Vora Gateway"
Remove-Item -Force "$env:USERPROFILE\.vora\gateway.cmd"
```

If you used a profile, delete the matching task name and `~\.vora-<profile>\gateway.cmd`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://vora.ai/install.sh` or `install.ps1`, the CLI was installed with `npm install -g vora@latest`.
Remove it with `npm rm -g vora` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `vora ...` / `bun run vora ...`):

1. Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2. Delete the repo directory.
3. Remove state + workspace as shown above.
