# VORA

**Voice-First AI Agent for Everyone**

VORA is a voice-first AI agent designed for non-technical users.

Users simply say **“Hey VORA”**, speak naturally, and VORA executes actions on their computer — like opening apps, navigating the browser, sending messages, and summarizing selected text.

> VORA is the voice-first experience layer that brings full-power AI agent capability to everyday users — no code, no terminal, no setup knowledge required.

---

## Product Overview

### Mental model
- **OpenClaw** is the underlying engine.
- **VORA** is the user-facing product layer.
- The goal is not to build a chatbot.
- The goal is to build a truly capable agent with simple, voice-first UX.

### Vision
VORA aims to transform AI agents from developer tools into daily tools for mainstream users.

Long-term direction:
- voice-controlled operating layer,
- personal AI operator,
- bridge between AI, desktop, mobile, and messaging.

### Core problem
Powerful agents already exist, but the user experience for normal users is still too technical.

VORA closes this gap with:
- voice-first interaction,
- one-click onboarding,
- transparent, understandable actions.

---

## Target Users (MVP)

- Students
- Office workers
- Non-technical freelancers
- Non-tech founders
- Heavy computer users unfamiliar with automation

Common pain points:
- repetitive manual steps,
- too much context switching,
- time lost on simple tasks.

VORA value:
- speak instead of clicking through workflows,
- reduce repetitive actions,
- save time on daily micro-tasks.

---

## Product Positioning

VORA is **not**:
- a generic chatbot,
- a Siri clone,
- a voice toy,
- a demo-only AI app.

VORA is:

> **A full-power AI operator with a voice-first interface and non-tech-first UX.**

---

## MVP Scope

### MVP goals
MVP success means proving that:
1. Wake word works reliably.
2. Voice commands trigger real system actions.
3. UX is simpler than raw agent tooling.
4. Users find it practically useful (not just impressive).

### Must-have features
- Local wake word: **“Hey VORA”**
- Basic voice session flow (wake → listen → transcribe → execute)
- Basic command execution:
  - open/switch apps,
  - open URLs,
  - basic Telegram message flow,
  - summarize selected text
- One-click onboarding UI for required permissions
- Action transparency states (listening / thinking / acting / done / error)

### Not in MVP
- Full multi-agent support
- Continuous always-on screen vision
- Full Telegram remote control
- Complex branching workflows
- Full mobile/Android app
- Full cross-platform parity from day one

---

## Core User Flow

1. User opens VORA.
2. User says **“Hey VORA.”**
3. Wake word is detected locally.
4. VORA responds and starts session.
5. User speaks a command.
6. Voice session converts speech to text.
7. Agent core interprets intent and executes tool actions.
8. UI shows progress step-by-step.
9. VORA returns response by voice (or text when needed).

---

## Architecture

```text
Mic
  -> Wake Word Engine
  -> Agora Voice Session
  -> Agent Core
  -> Tool Executor
  -> System / Apps / Browser / Messaging
```

### Key layers
- **Wake Word Layer:** local, lightweight, always listening for activation.
- **Voice Session Layer:** VAD + STT + TTS + turn management.
- **Agent Core:** intent understanding, tool selection, execution logic.
- **Tool Executor:** app control, browser automation, messaging, file/clipboard.
- **Perception Layer:** metadata-first context (active app, URL, selected text, clipboard, notifications).
- **Safety Runtime Layer:** loop prevention, spam control, safe execution discipline.

---

## Technical Direction (MVP)

- **Desktop:** Tauri
- **Wake word:** openWakeWord
- **Voice pipeline:** Agora Conversational AI (VAD + STT + TTS)
- **Browser automation:** Playwright
- **Agent architecture direction:** inspired by OpenClaw
- **Landing page:** Next.js + Vercel
- **Waitlist:** Tally.so (MVP)

### Why Agora for MVP
- single integrated voice pipeline,
- lower integration complexity,
- lower latency risk for demo quality.

Trade-off:
- cloud dependency + usage-based cost,
- requires internet for voice session.

Mitigation:
- wake-word remains local,
- sessions open only after trigger,
- short sessions to keep cost low.

---

## Screen Strategy

VORA uses an **event-driven** perception strategy to avoid heavy always-on compute.

1. **Metadata first:** active app, window title, selected text, clipboard, URL.
2. **On-demand screenshot:** only when user asks or verification is needed.
3. **Vision fallback:** only when metadata is not enough.

Core rule: no continuous screen streaming.

---

## Safety Model

- **Safe:** execute directly (e.g., open app, switch tab, read selected text)
- **Confirm:** require explicit user confirmation (e.g., send message, submit form)
- **Sensitive:** restricted/deferred in MVP (e.g., terminal commands, delete file, payments, credential-sensitive actions)

---

## UX Requirements

### Onboarding
No terminal setup required.

Users should be able to enable:
- microphone permissions,
- system/accessibility permissions,
- core setup in a guided flow.

### Main UI states
- idle
- listening
- transcribing
- thinking
- acting
- done
- error

### Action transparency
Users should always see what VORA is currently doing, step-by-step.

---

## Distribution (MVP)

VORA is shipped as real installable desktop binaries:
- **Windows:** `.exe` / `.msi`
- **macOS:** `.dmg`

Build path: `tauri build`.

MVP release hosting:
- **GitHub Releases** (versioned binaries + stable links)

---

## Landing Page (MVP)

The landing page is built in parallel with the app as:
1. distribution entry point,
2. waitlist + social proof layer.

Core sections:
- Hero + CTA
- Demo video
- Features
- Download links
- Waitlist form
- Beta pricing note (free)

---

## MVP Success Criteria

MVP is successful when:
1. End-to-end demo works reliably.
2. Wake word + voice-to-action is smooth enough for live demo.
3. At least two real use cases work (e.g., open app + summarize selected text).
4. First-time users can understand and use it quickly.

---

## Current Status

This repository contains the public product foundation for VORA.

Next updates will include:
- implementation milestones,
- setup/development docs,
- release artifacts,
- demo references.
