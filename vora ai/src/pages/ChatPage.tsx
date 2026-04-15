import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Send, Mic, MicOff, MessageSquare, AudioLines, Settings,
  Sparkles, Trash2, X, Save, Menu, Key, Server, Cpu, Plus,
  MessageCircle, Globe, Hash, Send as SendIcon, Bot
} from 'lucide-react';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type Session = { id: string; title: string; created_at: string; messages: ChatMessage[] };
type WakeWordEventPayload = {
  kind: 'starting' | 'ready' | 'volume' | 'trigger' | 'error' | 'log';
  message: string;
  model?: string;
  score?: number;
  volume?: number;
  latency_ms?: number;
};
type ConfirmRequiredPayload = {
  id: string;
  action: string;
  reason: string;
  risk: string;
  prompt_preview: string;
};
type Phase1CheckItem = {
  key: string;
  label: string;
  ok: boolean;
  message: string;
};
type Phase1SelfCheck = {
  overall_ok: boolean;
  checked_at: string;
  items: Phase1CheckItem[];
};
type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = { isFinal: boolean; 0: SpeechRecognitionAlternative };
type SpeechRecognitionResultList = { length: number; [index: number]: SpeechRecognitionResult };
type SpeechRecognitionEvent = { resultIndex: number; results: SpeechRecognitionResultList };
type SpeechRecognitionErrorEvent = { error: string };
type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
};

export const ChatPage = () => {
  const [mode, setMode] = useState<'chat' | 'voice'>('chat');
  const [panel, setPanel] = useState<'none' | 'history' | 'settings'>('none');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [wakeRunning, setWakeRunning] = useState(false);
  const [wakeVolume, setWakeVolume] = useState(0);
  const [wakeStatus, setWakeStatus] = useState('Wake word engine is stopped');
  const [privacyEnabled, setPrivacyEnabled] = useState(true);
  const [sttSupported, setSttSupported] = useState(false);
  const [transcriptLog, setTranscriptLog] = useState<string[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmRequiredPayload | null>(null);
  const [phase1Check, setPhase1Check] = useState<Phase1SelfCheck | null>(null);
  const [checkingPhase1, setCheckingPhase1] = useState(false);

  // Settings
  const [cfg, setCfg] = useState({
    provider: 'groq', groq_api_key: '', ollama_model: 'llama3.2',
    ollama_base_url: 'http://localhost:11434', gateway_mode: 'local',
    gateway_port: 27106, telegram_token: '', discord_token: '', discord_guild: ''
  });
  const [settingsSaved, setSettingsSaved] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const listenReasonRef = useRef<'manual' | 'wake'>('manual');
  const privacyEnabledRef = useRef(true);
  const loadingRef = useRef(false);

  const pushVoiceLog = (text: string) => {
    const line = `${new Date().toLocaleTimeString()}  ${text}`;
    setTranscriptLog(prev => [line, ...prev].slice(0, 12));
  };

  const parseConfirmError = (raw: string): ConfirmRequiredPayload | null => {
    if (!raw.includes('CONFIRM_REQUIRED:')) return null;
    const data = raw.split('CONFIRM_REQUIRED:')[1] || '';
    const [id, action, reason, risk] = data.split('|');
    if (!id || !action) return null;
    return {
      id,
      action,
      reason: reason || 'Sensitive action',
      risk: risk || 'Requires explicit confirmation',
      prompt_preview: '',
    };
  };

  // Init: load config + sessions, create first session if none
  useEffect(() => {
    (async () => {
      try {
        const status = await invoke<any>('get_setup_status');
        setCfg({
          provider: status.provider || 'groq',
          groq_api_key: status.groq_api_key || '',
          ollama_model: status.ollama_model || 'llama3.2',
          ollama_base_url: status.ollama_base_url || 'http://localhost:11434',
          gateway_mode: status.gateway_mode || 'local',
          gateway_port: status.gateway_port || 27106,
          telegram_token: status.telegram_token || '',
          discord_token: status.discord_token || '',
          discord_guild: status.discord_guild || '',
        });
        setPrivacyEnabled(status.privacy_enabled !== false);
      } catch (e) { console.error(e); }

      await refreshSessions(true);

      try {
        const running = await invoke<boolean>('get_wakeword_status');
        setWakeRunning(running);
        setWakeStatus(running ? 'Wake word engine running' : 'Wake word engine is stopped');
      } catch (e) {
        console.error('Failed to read wake status', e);
      }

      try {
        const privacy = await invoke<boolean>('get_privacy_state');
        setPrivacyEnabled(privacy);
      } catch (e) {
        console.error('Failed to read privacy state', e);
      }

      try {
        setCheckingPhase1(true);
        const report = await invoke<Phase1SelfCheck>('run_phase1_self_check');
        setPhase1Check(report);
      } catch (e) {
        console.error('Failed to run phase1 self-check', e);
      } finally {
        setCheckingPhase1(false);
      }
    })();

    const maybeWindow = window as SpeechWindow;
    const SpeechCtor = maybeWindow.SpeechRecognition || maybeWindow.webkitSpeechRecognition;
    if (SpeechCtor) {
      const recognition = new SpeechCtor();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'vi-VN';
      recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        setListening(true);
        setVoiceText('Listening...');
      };
      recognition.onend = () => {
        setListening(false);
        setVoiceText('');
      };
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalText = '';
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result?.[0]?.transcript || '';
          if (result.isFinal) finalText += transcript;
          else interimText += transcript;
        }
        if (interimText.trim()) {
          setVoiceText(interimText.trim());
        }
        if (finalText.trim()) {
          const clean = finalText.trim();
          pushVoiceLog(`STT(${listenReasonRef.current}): ${clean}`);
          setVoiceText(clean);
          setTimeout(() => setVoiceText(''), 1200);
          void sendVoiceCommand(clean);
        }
      };
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        const msg = event?.error || 'unknown';
        setListening(false);
        setVoiceText('');
        setWakeStatus(`STT error: ${msg}`);
        pushVoiceLog(`STT error: ${msg}`);
      };
      recognitionRef.current = recognition;
      setSttSupported(true);
    } else {
      setSttSupported(false);
      setWakeStatus('STT not supported in this WebView');
    }

    let wakeWordUnlisten: (() => void) | null = null;
    let confirmUnlisten: (() => void) | null = null;
    void (async () => {
      wakeWordUnlisten = await listen<WakeWordEventPayload>('wakeword-event', (event) => {
        const payload = event.payload;
        if (!payload) return;
        if (payload.kind === 'volume' && typeof payload.volume === 'number') {
          setWakeVolume(payload.volume);
        }
        if (payload.kind === 'ready') {
          setWakeRunning(true);
        }
        if (payload.kind === 'error') {
          setWakeRunning(false);
        }
        if (payload.kind === 'trigger') {
          listenReasonRef.current = 'wake';
          pushVoiceLog(`Wake detected (${payload.model || 'hey_vora'})`);
          const recognizer = recognitionRef.current;
          if (recognizer && privacyEnabledRef.current) {
            try { recognizer.start(); } catch { /* ignore busy */ }
          }
        }
        if (typeof payload.message === 'string' && payload.message.trim()) {
          setWakeStatus(payload.message);
        }
      });

      confirmUnlisten = await listen<ConfirmRequiredPayload>('confirm-required', (event) => {
        const payload = event.payload;
        if (!payload?.id) return;
        setPendingConfirm(payload);
      });
    })();

    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
      if (wakeWordUnlisten) wakeWordUnlisten();
      if (confirmUnlisten) confirmUnlisten();
    };
  }, []);

  useEffect(() => {
    privacyEnabledRef.current = privacyEnabled;
  }, [privacyEnabled]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const refreshSessions = async (autoSelect = false) => {
    try {
      const list = await invoke<Session[]>('list_sessions');
      setSessions(list);
      if (autoSelect) {
        if (list.length > 0) {
          await switchSession(list[0].id);
        } else {
          await newChat();
        }
      }
    } catch (e) { console.error(e); }
  };

  const switchSession = async (id: string) => {
    try {
      const msgs = await invoke<ChatMessage[]>('load_session', { sessionId: id });
      setMessages(msgs);
      setActiveSessionId(id);
    } catch (e) { console.error(e); }
  };

  const newChat = async () => {
    try {
      const session = await invoke<Session>('create_session');
      setMessages([]);
      setActiveSessionId(session.id);
      await refreshSessions();
      setPanel('none');
    } catch (e) { console.error(e); }
  };

  const deleteSession = async (id: string) => {
    await invoke('delete_session', { sessionId: id });
    if (id === activeSessionId) {
      await refreshSessions(true);
    } else {
      await refreshSessions();
    }
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const autoResize = () => {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }
  };

  const stringifyError = (error: unknown) => {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    return String(error);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    if (!privacyEnabled) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Privacy mode is OFF. Enable it in Settings to send commands.' }]);
      return;
    }
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = '44px';
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const reply = await invoke<string>('send_chat', { prompt: text });
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      // Refresh sessions to update title
      refreshSessions();
    } catch (error) {
      const raw = stringifyError(error);
      const confirm = parseConfirmError(raw);
      if (confirm) {
        setPendingConfirm(confirm);
        setMessages(prev => [...prev, { role: 'assistant', content: `Approval required: ${confirm.action}` }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${raw}` }]);
      }
    }
    setLoading(false);
  };

  const sendVoiceCommand = async (transcript: string) => {
    if (!transcript.trim() || loadingRef.current) return;
    if (!privacyEnabledRef.current) {
      setWakeStatus('Privacy mode is OFF. Voice command blocked.');
      return;
    }
    setMessages(prev => [...prev, { role: 'user', content: transcript }]);
    setLoading(true);
    try {
      const reply = await invoke<string>('inject_voice_command', { sttText: transcript });
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      refreshSessions();
    } catch (error) {
      const raw = stringifyError(error);
      const confirm = parseConfirmError(raw);
      if (confirm) {
        setPendingConfirm(confirm);
        setMessages(prev => [...prev, { role: 'assistant', content: `Approval required: ${confirm.action}` }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${raw}` }]);
      }
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const saveSettings = async () => {
    await invoke('update_settings', {
      provider: cfg.provider, groqApiKey: cfg.groq_api_key,
      ollamaModel: cfg.ollama_model, ollamaBaseUrl: cfg.ollama_base_url,
      gatewayMode: cfg.gateway_mode, gatewayPort: cfg.gateway_port,
      telegramToken: cfg.telegram_token, discordToken: cfg.discord_token,
      discordGuild: cfg.discord_guild,
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const runPhase1SelfCheck = async () => {
    try {
      setCheckingPhase1(true);
      const report = await invoke<Phase1SelfCheck>('run_phase1_self_check');
      setPhase1Check(report);
    } catch (error) {
      console.error('Phase 1 self-check failed', error);
      setWakeStatus(`Self-check error: ${stringifyError(error)}`);
    } finally {
      setCheckingPhase1(false);
    }
  };

  const startVoiceRecognition = (reason: 'manual' | 'wake') => {
    if (!privacyEnabled) {
      setWakeStatus('Privacy mode is OFF. Voice adapter is disabled.');
      return;
    }
    const recognizer = recognitionRef.current;
    if (!recognizer) {
      setWakeStatus('Speech recognition not available in this WebView');
      return;
    }
    listenReasonRef.current = reason;
    try {
      recognizer.start();
      pushVoiceLog(`STT start (${reason})`);
    } catch (error) {
      setWakeStatus(`Unable to start STT: ${String(error)}`);
    }
  };

  const stopVoiceRecognition = () => {
    const recognizer = recognitionRef.current;
    if (!recognizer) return;
    try { recognizer.stop(); } catch { /* ignore */ }
    setListening(false);
    setVoiceText('');
  };

  const toggleVoice = () => {
    if (listening) stopVoiceRecognition();
    else startVoiceRecognition('manual');
  };

  const toggleWakeEngine = async () => {
    try {
      if (wakeRunning) {
        await invoke('stop_wakeword_engine');
        setWakeRunning(false);
        setWakeStatus('Wake word engine stopped');
        return;
      }
      if (!privacyEnabled) {
        setWakeStatus('Enable privacy mode before starting wake word');
        return;
      }
      await invoke('start_wakeword_engine');
      setWakeStatus('Starting wake word engine...');
    } catch (e: any) {
      console.error(e);
      setWakeRunning(false);
      setWakeStatus(`Wake word error: ${String(e)}`);
    }
  };

  const togglePrivacy = async () => {
    const next = !privacyEnabled;
    try {
      await invoke('set_privacy_state', { enabled: next });
      setPrivacyEnabled(next);
      if (!next) {
        stopVoiceRecognition();
        setWakeRunning(false);
        setWakeStatus('Privacy OFF: wake word and outbound commands paused');
      } else {
        setWakeStatus('Privacy ON: voice + chat pipeline enabled');
      }
    } catch (error) {
      console.error('Failed to toggle privacy', error);
    }
  };

  const resolveConfirm = async (approved: boolean) => {
    if (!pendingConfirm) return;
    const confirmId = pendingConfirm.id;
    try {
      if (!approved) {
        await invoke('deny_confirm_request', { confirmId });
        setMessages(prev => [...prev, { role: 'assistant', content: 'Action denied.' }]);
        setPendingConfirm(null);
        return;
      }
      setLoading(true);
      const reply = await invoke<string>('approve_confirm_request', { confirmId });
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      refreshSessions();
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${stringifyError(error)}` }]);
    } finally {
      setPendingConfirm(null);
      setLoading(false);
    }
  };

  const SettingField = ({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-white/35 uppercase tracking-widest flex items-center gap-1.5">{icon} {label}</label>
      {children}
    </div>
  );

  return (
    <div className="chat-container relative">
      {/* Slide Panel */}
      {panel !== 'none' && (
        <div className="absolute inset-0 z-50 flex">
          <div className="w-full max-w-[320px] h-full bg-[#0d0d1a]/95 backdrop-blur-xl border-r border-white/8 flex flex-col animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
              <h2 className="text-xs font-bold uppercase tracking-widest text-white/60">
                {panel === 'history' ? 'Sessions' : 'Settings'}
              </h2>
              <button onClick={() => setPanel('none')} className="p-1.5 rounded-lg hover:bg-white/10"><X size={16} className="text-white/40" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {/* === HISTORY === */}
              {panel === 'history' && (
                <div className="space-y-1.5">
                  <button onClick={newChat} className="w-full py-2.5 mb-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 hover:border-[#6c5ce7] hover:bg-[#6c5ce7]/10 text-white/50 hover:text-white text-xs font-semibold uppercase tracking-wider transition-all">
                    <Plus size={14} /> New Chat
                  </button>
                  {sessions.length === 0 && <p className="text-white/15 text-xs text-center py-6 italic">No sessions yet</p>}
                  {sessions.map(s => (
                    <div
                      key={s.id}
                      onClick={() => { switchSession(s.id); setPanel('none'); }}
                      className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${
                        s.id === activeSessionId
                          ? 'bg-[#6c5ce7]/15 border-[#6c5ce7]/40 text-white'
                          : 'bg-white/3 border-transparent hover:bg-white/6 text-white/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MessageCircle size={14} className="shrink-0 text-white/25" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{s.title}</p>
                          <p className="text-[10px] text-white/20">{new Date(s.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 transition-all"
                      >
                        <Trash2 size={12} className="text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* === SETTINGS === */}
              {panel === 'settings' && (
                <div className="space-y-5">
                  {/* Phase 1 Self-check */}
                  <div className="p-3 rounded-xl bg-white/3 border border-white/8 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.15em]">🧪 Phase 1 Self-Check</p>
                      <button
                        onClick={runPhase1SelfCheck}
                        disabled={checkingPhase1}
                        className="px-2.5 py-1 rounded-md border border-white/20 text-[10px] uppercase tracking-widest text-white/60 hover:bg-white/10 disabled:opacity-50"
                      >
                        {checkingPhase1 ? 'Checking...' : 'Run'}
                      </button>
                    </div>
                    {!phase1Check && <p className="text-[11px] text-white/35">No report yet.</p>}
                    {phase1Check && (
                      <div className="space-y-1.5">
                        <p className={`text-[11px] ${phase1Check.overall_ok ? 'text-emerald-300' : 'text-amber-300'}`}>
                          {phase1Check.overall_ok ? 'Overall: PASS' : 'Overall: CHECK WARNINGS'}
                        </p>
                        {phase1Check.items.map(item => (
                          <div key={item.key} className="rounded-md border border-white/10 bg-white/5 p-2">
                            <p className={`text-[11px] ${item.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                              {item.ok ? '✓' : '✗'} {item.label}
                            </p>
                            <p className="text-[10px] text-white/45">{item.message}</p>
                          </div>
                        ))}
                        <p className="text-[10px] text-white/25">
                          Checked at: {new Date(phase1Check.checked_at).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Privacy */}
                  <div className="p-3 rounded-xl bg-white/3 border border-white/8 space-y-3">
                    <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.15em]">🔒 Privacy</p>
                    <p className="text-[11px] text-white/45">
                      {privacyEnabled
                        ? 'ON: chat + voice pipeline active'
                        : 'OFF: wake word and outbound commands are paused'}
                    </p>
                    <button
                      onClick={togglePrivacy}
                      className={`w-full py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-all ${
                        privacyEnabled
                          ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                          : 'bg-red-500/12 border-red-400/35 text-red-300'
                      }`}
                    >
                      {privacyEnabled ? 'Disable Privacy Mode' : 'Enable Privacy Mode'}
                    </button>
                  </div>

                  {/* Gateway */}
                  <div className="p-3 rounded-xl bg-white/3 border border-white/8 space-y-4">
                    <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.15em]">⚡ Gateway</p>
                    <SettingField icon={<Globe size={11} />} label="Mode">
                      <div className="flex gap-1.5">
                        {['local', 'cloud'].map(m => (
                          <button key={m} onClick={() => setCfg({...cfg, gateway_mode: m})}
                            className={`flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border ${
                              cfg.gateway_mode === m ? 'bg-[#6c5ce7]/20 border-[#6c5ce7] text-[#a29bfe]' : 'bg-white/3 border-white/8 text-white/30'
                            }`}>{m}</button>
                        ))}
                      </div>
                    </SettingField>
                    <SettingField icon={<Server size={11} />} label="Port">
                      <input type="number" value={cfg.gateway_port} onChange={e => setCfg({...cfg, gateway_port: parseInt(e.target.value) || 27106})} className="form-input text-xs font-mono" />
                    </SettingField>
                  </div>

                  {/* Provider */}
                  <div className="p-3 rounded-xl bg-white/3 border border-white/8 space-y-4">
                    <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.15em]">🧠 AI Provider</p>
                    <SettingField icon={<Cpu size={11} />} label="Provider">
                      <div className="flex gap-1.5">
                        {['ollama', 'groq'].map(p => (
                          <button key={p} onClick={() => setCfg({...cfg, provider: p})}
                            className={`flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border ${
                              cfg.provider === p ? 'bg-[#6c5ce7]/20 border-[#6c5ce7] text-[#a29bfe]' : 'bg-white/3 border-white/8 text-white/30'
                            }`}>{p}</button>
                        ))}
                      </div>
                    </SettingField>
                    {cfg.provider === 'groq' && (
                      <SettingField icon={<Key size={11} />} label="Groq API Key">
                        <input type="password" value={cfg.groq_api_key} onChange={e => setCfg({...cfg, groq_api_key: e.target.value})} placeholder="gsk_..." className="form-input text-xs" />
                      </SettingField>
                    )}
                    {cfg.provider === 'ollama' && (
                      <>
                        <SettingField icon={<Bot size={11} />} label="Model">
                          <input value={cfg.ollama_model} onChange={e => setCfg({...cfg, ollama_model: e.target.value})} placeholder="llama3.2" className="form-input text-xs" />
                        </SettingField>
                        <SettingField icon={<Globe size={11} />} label="Base URL">
                          <input value={cfg.ollama_base_url} onChange={e => setCfg({...cfg, ollama_base_url: e.target.value})} placeholder="http://localhost:11434" className="form-input text-xs" />
                        </SettingField>
                      </>
                    )}
                  </div>

                  {/* Channels */}
                  <div className="p-3 rounded-xl bg-white/3 border border-white/8 space-y-4">
                    <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.15em]">📡 Channels</p>
                    <SettingField icon={<SendIcon size={11} />} label="Telegram Bot Token">
                      <input type="password" value={cfg.telegram_token} onChange={e => setCfg({...cfg, telegram_token: e.target.value})} placeholder="Optional" className="form-input text-xs" />
                    </SettingField>
                    <SettingField icon={<Hash size={11} />} label="Discord Bot Token">
                      <input type="password" value={cfg.discord_token} onChange={e => setCfg({...cfg, discord_token: e.target.value})} placeholder="Optional" className="form-input text-xs" />
                    </SettingField>
                    <SettingField icon={<Hash size={11} />} label="Discord Guild ID">
                      <input value={cfg.discord_guild} onChange={e => setCfg({...cfg, discord_guild: e.target.value})} placeholder="Optional" className="form-input text-xs" />
                    </SettingField>
                  </div>

                  <button onClick={saveSettings} className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-sm">
                    <Save size={15} /> {settingsSaved ? '✓ Saved!' : 'Save All Settings'}
                  </button>
                  <p className="text-[9px] text-white/12 text-center italic pb-2">Settings persist across app restarts</p>
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setPanel('none')} />
        </div>
      )}

      {pendingConfirm && (
        <div className="absolute inset-0 z-[60] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0d0d1a] p-4 space-y-3">
            <p className="text-[10px] font-bold text-white/35 uppercase tracking-[0.18em]">Approval Required</p>
            <h3 className="text-sm font-semibold text-white">{pendingConfirm.action}</h3>
            <p className="text-xs text-white/60">{pendingConfirm.reason}</p>
            <p className="text-xs text-red-300/90">Risk: {pendingConfirm.risk}</p>
            {pendingConfirm.prompt_preview && (
              <div className="rounded-lg bg-white/5 border border-white/10 p-2">
                <p className="text-[11px] text-white/60 font-mono">{pendingConfirm.prompt_preview}</p>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => resolveConfirm(false)}
                className="flex-1 py-2 rounded-lg border border-white/20 text-white/65 hover:bg-white/10 text-xs uppercase tracking-widest"
              >
                Deny
              </button>
              <button
                onClick={() => resolveConfirm(true)}
                className="flex-1 py-2 rounded-lg border border-emerald-400/40 bg-emerald-500/15 text-emerald-300 text-xs uppercase tracking-widest"
              >
                Approve Once
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="chat-header">
        <div className="flex items-center gap-2">
          <button onClick={() => setPanel(panel === 'history' ? 'none' : 'history')} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <Menu size={18} className="text-white/50" />
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] flex items-center justify-center">
            <Sparkles size={14} />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold tracking-wide">VORA</h1>
            <p className="text-[10px] text-white/25 uppercase tracking-wider">{loading ? 'Thinking...' : 'Online'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="mode-tabs">
            <button className={`mode-tab ${mode === 'chat' ? 'active' : ''}`} onClick={() => setMode('chat')}>
              <MessageSquare size={13} className="inline mr-1 -mt-0.5" />Chat
            </button>
            <button className={`mode-tab ${mode === 'voice' ? 'active' : ''}`} onClick={() => setMode('voice')}>
              <AudioLines size={13} className="inline mr-1 -mt-0.5" />Voice
            </button>
          </div>
          <button onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <Settings size={18} className="text-white/40" />
          </button>
        </div>
      </div>

      {/* Chat */}
      {mode === 'chat' && (
        <>
          <div className="chat-messages" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#6c5ce7]/30 to-[#a29bfe]/10 flex items-center justify-center">
                  <Sparkles size={28} className="text-[#a29bfe]" />
                </div>
                <p className="text-white/20 text-sm">Start a conversation</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`msg-bubble ${msg.role === 'user' ? 'msg-user' : 'msg-assistant'}`}>
                {msg.content}
              </div>
            ))}
            {loading && (
              <div className="msg-bubble msg-assistant">
                <div className="flex gap-1.5 py-1">
                  <div className="w-2 h-2 bg-white/30 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-white/30 rounded-full animate-bounce [animation-delay:150ms]" />
                  <div className="w-2 h-2 bg-white/30 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}
          </div>
          <div className="chat-input-bar">
            <textarea
              ref={textareaRef} value={input}
              onChange={e => { setInput(e.target.value); autoResize(); }}
              onKeyDown={handleKeyDown}
              placeholder={privacyEnabled ? 'Message VORA...' : 'Enable Privacy Mode in Settings to chat'}
              rows={1}
              disabled={loading || !privacyEnabled}
            />
            <button onClick={() => sendMessage(input)} disabled={loading || !input.trim() || !privacyEnabled}
              className="p-3 rounded-full bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] text-white disabled:opacity-30 transition-all hover:scale-105 active:scale-95 shrink-0">
              <Send size={18} />
            </button>
          </div>
        </>
      )}

      {/* Voice */}
      {mode === 'voice' && (
        <>
          <div className="voice-container">
            <p className="text-xs text-white/30 uppercase tracking-[0.2em] font-semibold">
              {listening ? 'Listening...' : 'Tap to speak'}
            </p>
            <div className={`voice-orb ${listening ? 'listening' : ''}`} onClick={toggleVoice}>
              {listening ? <MicOff size={40} className="text-white/90" /> : <Mic size={40} className="text-white/70" />}
            </div>
            {voiceText && <p className="text-sm italic text-white/50 text-center max-w-[260px]">"{voiceText}"</p>}
            <button
              onClick={toggleWakeEngine}
              className={`px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest border transition-all ${
                wakeRunning
                  ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                  : 'bg-white/5 border-white/15 text-white/45 hover:bg-white/10'
              }`}
            >
              {wakeRunning ? 'Stop Wake Word' : 'Start Wake Word'}
            </button>
            <p className="text-[10px] text-white/25 text-center">{wakeStatus}</p>
            <div className="w-[220px] h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] transition-all duration-150"
                style={{ width: `${wakeVolume}%` }}
              />
            </div>
            <p className="text-[10px] text-white/20 uppercase tracking-widest">
              Voice Adapter (Phase 1) • {sttSupported ? 'Web Speech STT ready' : 'STT unavailable'}
            </p>
          </div>
          <div className="px-4 pb-2">
            <p className="text-[10px] text-white/35 uppercase tracking-widest mb-2">Transcript Events</p>
            <div className="max-h-[18vh] overflow-y-auto bg-white/5 border border-white/10 rounded-lg p-2">
              {transcriptLog.length === 0 && (
                <p className="text-[11px] text-white/30">No transcript events yet.</p>
              )}
              {transcriptLog.map((line, idx) => (
                <p key={`${line}-${idx}`} className="text-[11px] text-white/55 font-mono leading-relaxed">{line}</p>
              ))}
            </div>
          </div>
          <div className="px-4 pb-4 max-h-[28vh] overflow-y-auto">
            {messages.slice(-4).map((msg, i) => (
              <div key={i} className={`msg-bubble mb-2 ${msg.role === 'user' ? 'msg-user' : 'msg-assistant'}`} style={{ maxWidth: '90%', fontSize: '12px' }}>
                {msg.content}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
