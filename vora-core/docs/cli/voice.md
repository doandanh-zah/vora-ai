---
summary: "CLI reference for `vora voice` (wake word + voice loop in terminal)"
read_when:
  - You want wake-word voice turns from terminal
  - You need Agora STT bridge setup for `vora voice`
title: "voice"
---

# `vora voice`

Wake-word terminal loop:

- OpenWakeWord (`wake_word/main.py`) listens for trigger
- STT adapter captures the first command transcript, then a short follow-up window
  keeps the spoken conversation going without repeating the wake word
- Transcript is sent to Gateway via `chat.send`
- Assistant reply is printed, optional Hume TTS playback

The Agora STT bridge prints a clear readiness cue before every capture:

```text
✓ Listening now (en-US). Speak now.
```

Wait for that line, or the terminal beep, before speaking. The follow-up timer
starts after this readiness signal, not while the browser/microphone bridge is
still starting.

## Commands

```bash
vora voice
vora voice doctor
```

## Core options

- `--stt-provider <manual|agora>`: choose STT input path.
- `--stt-lang <lang>`: STT language list. Default is `en-US`.
- `--tts-provider <none|hume|elevenlabs>`: choose reply voice playback.
- `--debug`: show low-level voice diagnostics, including mic levels and run IDs.
- `--once`: stop after one successful wake -> reply turn.
- `--no-follow-up`: require wake word before every turn.
- `--follow-up-max-turns <n>`: cap spoken follow-ups before re-arming wake word.
- `--wake-dir <path>`, `--wake-model <path>`, `--wake-threshold <0..1>`.
- `--session <key>`, `--url`, `--token`, `--password` for Gateway target/session.

## STT modes

### Manual (debug-first)

```bash
vora voice --stt-provider manual --tts-provider none
```

After wake trigger, type transcript into terminal.

### Agora (bundled bridge)

`vora voice --stt-provider agora` uses bundled bridge script by default:

- `scripts/agora-stt-bridge.mjs`
- supports placeholders `{lang}` and `{timeout_ms}` in custom commands
- defaults to `en-US`. Beta voice mode expects English speech for the most reliable STT.

Required env for bundled bridge:

- `VORA_AGORA_APP_ID`
- `VORA_AGORA_CUSTOMER_KEY`
- `VORA_AGORA_CUSTOMER_SECRET`

Common optional env:

- `VORA_AGORA_CHANNEL`
- `VORA_AGORA_RTC_TOKEN`
- `VORA_AGORA_UID`
- `VORA_AGORA_STT_BOT_UID`
- `VORA_AGORA_API_BASE`

Use English-only mode for the current beta:

```bash
vora voice --stt-provider agora --stt-lang en-US
```

## Hume TTS

By default, `vora voice` uses the VORA backend for Hume TTS, so local Hume keys
are not required for normal installs. Hume speed defaults to `1.2`.

```bash
vora voice --stt-provider manual --tts-provider hume
```

Optional:

- `VORA_HUME_API_KEY` / `HUME_API_KEY` for direct local mode
- `VORA_HUME_VOICE_ID` / `HUME_VOICE_ID`
- `VORA_HUME_SPEED` / `HUME_SPEED`
- or the matching `--hume-*` CLI flags

`elevenlabs` remains accepted as a compatibility provider, but it is not the
default terminal voice path.

## Screen Memory

Say a phrase like `Hey VORA, remember what I am doing now`.

VORA captures the current screen, sends it as an image attachment to the active
model, and writes a short memory under `~/.vora/workspace/memory/voice-screen`.
It also updates `~/.vora/workspace/HEARTBEAT.md` so the next Gateway startup can
briefly remind you what it last saw and ask if you want help continuing.

## Health checks

```bash
vora voice doctor
vora voice doctor --json
```

`doctor` validates wake-word runtime, gateway reachability, STT bridge readiness, and TTS keys.
