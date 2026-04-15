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
- STT adapter captures one command transcript
- Transcript is sent to Gateway via `chat.send`
- Assistant reply is printed, optional Hume TTS playback

## Commands

```bash
vora voice
vora voice doctor
```

## Core options

- `--stt-provider <manual|agora>`: choose STT input path.
- `--tts-provider <none|hume>`: choose reply voice playback.
- `--once`: stop after one successful wake -> reply turn.
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

## Hume TTS

To speak assistant replies:

```bash
export VORA_HUME_API_KEY=...
vora voice --stt-provider manual --tts-provider hume
```

Optional:

- `VORA_HUME_VOICE_ID`
- or `--hume-voice-id <id>`

## Health checks

```bash
vora voice doctor
vora voice doctor --json
```

`doctor` validates wake-word runtime, gateway reachability, STT bridge readiness, and TTS keys.
