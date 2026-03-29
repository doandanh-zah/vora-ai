# OpenClaw Architecture Review for VORA (Repo Study)

> Source repo reviewed: `https://github.com/openclaw/openclaw`  
> Snapshot checked: commit `798e5f9501`

## 1) Tổng quan kiến trúc OpenClaw (góc nhìn để build VORA)

OpenClaw hiện tách khá rõ 4 lớp:

1. **Agent Runtime / Command Orchestration**
   - Entry orchestration: `src/agents/agent-command.ts`
   - Per-attempt execution: `src/agents/command/attempt-execution.ts`
   - Embedded runtime loop: `src/agents/pi-embedded-runner/run.ts`

2. **Tool Abstraction Layer**
   - Tool registry/assembly: `src/agents/openclaw-tools.ts`
   - Tool schema normalization + provider compatibility: `src/agents/pi-tools.schema.ts`
   - Tool param normalization (Claude-style aliases, validation): `src/agents/pi-tools.params.ts`
   - Concrete tools: `src/agents/tools/*`

3. **Session + Context Lifecycle**
   - Session resolution + reset/freshness: `src/agents/command/session.ts`
   - Session store update after run: `src/agents/command/session-store.ts`
   - Session config/transcript modules: `src/config/sessions/*`
   - Context engine boundary: `src/context-engine/*`

4. **UI/Presentation Layer**
   - Web UI app shell: `ui/src/ui/*`
   - Tool stream render: `ui/src/ui/app-tool-stream.ts`
   - Chat render/lifecycle: `ui/src/ui/app-chat.ts`, `ui/src/ui/app-render.ts`

---

## 2) Tool abstraction của OpenClaw đang làm như nào

## 2.1 Tool registry
OpenClaw build tool list theo context runtime tại `createOpenClawTools(...)` trong `src/agents/openclaw-tools.ts`:
- Inject context: session key, channel, account, thread/topic, sandbox, workspace...
- Lắp tools core (canvas/nodes/message/tts/web/sessions/subagents/...)
- Merge plugin tools (qua plugin runtime)
- Apply delivery defaults cho plugin tools

=> Đây là một **tool-composition architecture** khá chuẩn để VORA tái sử dụng làm “Agent Capability Kernel”.

## 2.2 Schema abstraction
`src/agents/pi-tools.schema.ts` xử lý:
- Flatten schema union (`anyOf/oneOf`) để model/provider dễ parse
- Normalize top-level object schema
- Provider-specific cleaning (Gemini/xAI/...)

=> Điểm mạnh: giảm lỗi “model gọi sai schema”.

## 2.3 Param abstraction
`src/agents/pi-tools.params.ts` xử lý:
- Alias normalize (`file_path -> path`, `old_string -> oldText`, ...)
- Structured text normalize
- Required param assertion

=> Điểm mạnh: giảm loop do sai params/tool-call malformed.

---

## 3) Command loop trong OpenClaw (runtime behavior)

`runEmbeddedPiAgent()` (`src/agents/pi-embedded-runner/run.ts`) là vòng lặp chính:

1. Resolve model/auth/profile
2. Chạy `runEmbeddedAttempt(...)`
3. Quan sát stopReason/error/tokens
4. Retry/fallback theo policy:
   - rotate auth profile
   - switch fallback model
   - compact context
   - truncate oversized tool results
5. Build payload cuối để deliver

Có safety cho loop/retry:
- retry limit cứng
- timeout-compaction strategy
- overflow-compaction strategy
- tool result truncation fallback

Và có docs cho loop detection guard:
- `docs/tools/loop-detection.md`

=> Với VORA, đây là core cực giá trị để giữ trải nghiệm ổn định khi voice command dài/nhảy context nhiều.

---

## 4) Context/session đang quản lý như nào

## 4.1 Session key & freshness
`src/agents/command/session.ts`:
- Resolve session theo sender/sessionKey/sessionId
- Check freshness + reset policy
- Reuse hoặc tạo session mới

## 4.2 Session persistence
`src/config/sessions/*` + `session-store.ts`:
- Ghi token usage, model runtime, compaction count, estimated cost
- Persist transcript path/session metadata

## 4.3 Context engine abstraction
`src/context-engine/*` + hooks trong run loop:
- `contextEngine.compact(...)`
- maintenance flow sau compaction
- support runtimeContext để debug/trace

=> Kết luận: OpenClaw giữ được session continuity khá chặt, phù hợp cho VORA nếu cần “liền mạch hội thoại + hành động hệ thống”.

---

## 5) Module nên GIỮ cho VORA

## 5.1 Nên giữ gần như nguyên bản
1. **Tool abstraction core**
   - `openclaw-tools.ts`
   - `pi-tools.schema.ts`
   - `pi-tools.params.ts`
2. **Session + transcript + context compaction lifecycle**
   - `src/agents/command/session.ts`
   - `src/agents/command/session-store.ts`
   - `src/config/sessions/*`
   - `src/context-engine/*`
3. **Retry/fallback state machine trong `run.ts`**
   - vì đây là phần khó nhất để agent chạy production ổn định.

## 5.2 Nên giữ nhưng adapter lại
1. **message/channel tools** (Telegram/Discord/...)  
   -> giữ interface, adapter theo kênh VORA cần.
2. **nodes/canvas/browser bridge**  
   -> giữ contract, thu hẹp phạm vi cho MVP.

---

## 6) Module nên BỎ/GIẢM cho MVP VORA

Để MVP nhẹ + tập trung voice-first desktop operator:

1. **Subagent orchestration sâu**
   - `sessions_spawn`, `subagents` full stack có thể để phase sau.
2. **Cron/automation scheduling layer**
   - không critical cho voice-first MVP.
3. **Nhiều channel plugins enterprise**
   - giữ Telegram tối thiểu nếu cần demo, còn lại defer.
4. **ACP control-plane phức tạp**
   - nếu MVP chỉ cần 1 runtime path thì không cần bật đầy đủ ngay.

---

## 7) Module nên “bọc UI” lại cho VORA

OpenClaw UI hiện thiên về operator/dev console. Với VORA nên wrap thành UX đơn giản hơn:

## 7.1 Giữ backend event model, đổi frontend surface
- Tận dụng event streams từ agent/tool lifecycle
- Build UI states theo product spec VORA:
  - `idle -> listening -> transcribing -> thinking -> acting -> done/error`

## 7.2 Tool transparency card
Từ logic của `app-tool-stream.ts` có thể map sang:
- “VORA đang mở Chrome..."
- “VORA đang đọc văn bản đã chọn..."
- “VORA đang gửi tin nhắn (chờ xác nhận)..."

## 7.3 Confirm/Sensitive action gate UI
Dùng safety model 3 tầng:
- Safe: auto-run
- Confirm: UI confirm
- Sensitive: block/defer trong MVP

OpenClaw đã có nhiều policy hooks; VORA chỉ cần UX hóa lại thay vì viết mới từ đầu.

---

## 8) Đề xuất kiến trúc VORA (dựa trên OpenClaw)

## 8.1 Kernel giữ từ OpenClaw
- Agent runtime loop + fallback/compaction
- Tool abstraction + schema/param normalization
- Session/transcript/context engine

## 8.2 VORA-specific layer thêm vào
1. Wake word + voice session gateway
2. Intent-to-tool policy cho desktop consumer tasks
3. Voice-first state UI + confirmation UX
4. Permission onboarding flow (mic/accessibility/browser)

## 8.3 API boundary khuyến nghị
Tách 3 boundary rõ ràng:
- **Voice boundary** (ASR/TTS/session turn)
- **Agent boundary** (prompt/tool loop/session)
- **Action boundary** (OS/browser/message tool adapters)

=> Làm vậy để đổi STT/TTS provider không ảnh hưởng tool/runtime core.

---

## 9) Kết luận ngắn

OpenClaw hiện đã có nền abstraction tốt cho:
- tool contracts,
- retry/fallback command loop,
- session/context lifecycle.

VORA nên:
- **Giữ core runtime + tool abstraction của OpenClaw**,
- **bỏ bớt orchestration/channel không cần cho MVP**,
- **bọc lại UI theo voice-first consumer UX**.

Đây là đường nhanh nhất để có MVP mạnh mà không phải build lại “agent operating core” từ đầu.
