# VORA

**VORA** is a voice-first AI operator for everyday computer users.

VORA helps non-technical users control their computer through natural voice commands (e.g., “Hey VORA, open Telegram”, “Summarize this text”, “Open Chrome and go to Notion”).

The product is designed to bring full-power AI agent capabilities to people who do not use terminal, automation tools, or prompt engineering.

---

## Vision

Turn AI agents from a developer-only tool into a daily tool for mainstream users.

In the long term, VORA aims to become:
- a voice-controlled operating layer,
- a personal AI operator,
- and a bridge between AI, desktop apps, browser workflows, and messaging.

---

## Core Problem

Powerful agent engines exist, but the user experience for non-technical users is still too hard.

Most users:
- don’t want setup complexity,
- don’t want terminal workflows,
- and drop off when onboarding is too technical.

VORA solves this by wrapping strong agent capabilities inside a simple, voice-first product experience.

---

## Product Positioning

VORA is **not** positioned as:
- a basic chatbot,
- a Siri clone,
- or a voice toy.

VORA is positioned as:

> **Voice-first AI operator for everyday computer users.**

---

## MVP Goals

The MVP focuses on validating four things:
1. Wake word works reliably.
2. Users can give voice commands and the agent can execute real actions.
3. The experience is simpler than raw agent tooling.
4. Users find it genuinely useful (not just impressive).

---

## MVP Scope

### In scope
- Local wake word: **“Hey VORA”**
- Voice session flow (wake → capture voice → transcribe → execute)
- Basic command execution:
  - open apps,
  - switch apps,
  - open URLs
- Basic messaging flow (e.g., send Telegram messages)
- Read selected text and summarize
- One-click onboarding flow for required permissions
- Action transparency UI states (listening, thinking, acting, done/error)

### Out of scope (for MVP)
- Full multi-agent architecture
- Always-on continuous vision
- Complex branching workflows
- Complete mobile/Android integration
- Deep proactive behavior
- Full cross-platform support from day one

---

## Core User Flow

1. User opens VORA.
2. User says: **“Hey VORA.”**
3. Wake word is detected.
4. VORA responds and listens for request.
5. User gives a task.
6. Speech is transcribed to text.
7. Agent core interprets intent and executes tools.
8. UI shows progress and action status.
9. VORA returns result via voice/text.

---

## High-Level Architecture

```text
Mic
  -> Wake Word Engine
  -> Voice Session Layer
  -> Agent Core
  -> Tool Executor
  -> System / Apps / Browser / Messaging
```

### Architecture principles
- Voice-first UX
- Non-tech-first product decisions
- Local-first where possible
- Event-driven perception (not always-heavy)
- Transparent actions
- Safety without removing agent power

---

## Technical Direction (MVP)

- **Desktop framework:** Tauri
- **Wake word:** openWakeWord
- **VAD:** Silero VAD
- **STT:** Whisper local (with hybrid fallback if needed)
- **TTS:** practical solution optimized for smooth UX in MVP
- **Browser automation:** Playwright
- **Agent core direction:** inspired by OpenClaw architecture, adapted for VORA use cases

---

## Safety Model

Actions are grouped by risk:

- **Safe:** can run directly (e.g., open app, read selected text)
- **Confirm:** should require user confirmation (e.g., send message, submit form)
- **Sensitive:** restricted/deferred in MVP (e.g., terminal command, delete file, payment, credential-related operations)

---

## What Success Looks Like

MVP is successful when:
- end-to-end voice-to-action demos are smooth,
- users quickly understand value,
- users can save time on real daily tasks,
- and the architecture is strong enough to keep building.

---

## Status

This repository currently holds the public product foundation for VORA.

Upcoming updates will include:
- architecture docs,
- implementation milestones,
- setup instructions,
- and MVP demos.
