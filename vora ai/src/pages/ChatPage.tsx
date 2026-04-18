import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Send, Mic, MicOff, MessageSquare, AudioLines, Settings,
  Sparkles, Trash2, Save, Menu, Key, Server, Cpu, Plus,
  MessageCircle, Globe, Hash, Bot, Shield, Eye, EyeOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VoraLogo } from '@/components/VoraLogo';

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
  const [sideOpen, setSideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState('');
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

  const [cfg, setCfg] = useState({
    provider: 'groq', groq_api_key: '', ollama_model: 'llama3.2',
    ollama_base_url: 'http://localhost:11434', gateway_mode: 'local',
    gateway_port: 27106, telegram_token: '', discord_token: '', discord_guild: ''
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showGroq, setShowGroq] = useState(false);
  const [showTele, setShowTele] = useState(false);
  const [showDiscord, setShowDiscord] = useState(false);
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

  useEffect(() => {
    (async () => {
      try {
        const s = await invoke<any>('get_setup_status');
        setCfg({
          provider: s.provider || 'groq', groq_api_key: s.groq_api_key || '',
          ollama_model: s.ollama_model || 'llama3.2', ollama_base_url: s.ollama_base_url || 'http://localhost:11434',
          gateway_mode: s.gateway_mode || 'local', gateway_port: s.gateway_port || 27106,
          telegram_token: s.telegram_token || '', discord_token: s.discord_token || '', discord_guild: s.discord_guild || '',
        });
        setPrivacyEnabled(s.privacy_enabled !== false);
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const refreshSessions = async (autoSelect = false) => {
    try {
      const list = await invoke<Session[]>('list_sessions');
      setSessions(list);
      if (autoSelect) {
        if (list.length > 0) await switchSession(list[0].id);
        else await newChat();
      }
    } catch (e) { console.error(e); }
  };

  const switchSession = async (id: string) => {
    const msgs = await invoke<ChatMessage[]>('load_session', { sessionId: id });
    setMessages(msgs); setActiveId(id); setSideOpen(false);
  };

  const newChat = async () => {
    const session = await invoke<Session>('create_session');
    setMessages([]); setActiveId(session.id);
    await refreshSessions(); setSideOpen(false);
  };

  const deleteSession = async (id: string) => {
    await invoke('delete_session', { sessionId: id });
    if (id === activeId) await refreshSessions(true);
    else await refreshSessions();
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
    setMessages(p => [...p, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const reply = await invoke<string>('send_chat', { prompt: text });
      setMessages(p => [...p, { role: 'assistant', content: reply }]);
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
    try {
      setSaving(true);
      console.log('[DEBUG] ChatPage saveSettings calling update_settings with:', {
        provider: cfg.provider,
        groqApiKey: cfg.groq_api_key ? (cfg.groq_api_key.substring(0, 7) + '...') : 'empty',
        telegram: cfg.telegram_token ? 'is_set' : 'empty'
      });
      await invoke('update_settings', {
        provider: cfg.provider,
        groqApiKey: cfg.groq_api_key,
        ollamaModel: cfg.ollama_model,
        ollamaBaseUrl: cfg.ollama_base_url,
        gatewayMode: cfg.gateway_mode,
        gatewayPort: cfg.gateway_port,
        telegramToken: cfg.telegram_token,
        discordToken: cfg.discord_token,
        discordGuild: cfg.discord_guild,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings: ' + String(error));
    } finally {
      setSaving(false);
    }
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

  const FieldGroup = ({ label, icon, children, action }: { label: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs flex items-center gap-1.5">{icon} {label}</Label>
        {action}
      </div>
      {children}
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* ─── Header ─── */}
      <header className="flex items-center justify-between px-3 h-12 border-b border-border bg-card/80 backdrop-blur-xl shrink-0 z-10">
        <div className="flex-1 flex items-center gap-2">
          {/* Sessions Sidebar Trigger */}
          <Sheet open={sideOpen} onOpenChange={setSideOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0 flex flex-col border-r border-border bg-card overflow-hidden">
              <SheetHeader className="p-4 border-b border-border">
                <SheetTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Sessions</SheetTitle>
              </SheetHeader>
              <div className="px-3 py-3 border-b border-border/50">
                <Button variant="outline" size="sm" className="w-full justify-start gap-2 border-white/10 bg-white/5 hover:bg-white/10" onClick={newChat}>
                  <Plus className="h-3.5 w-3.5" /> New Chat
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 px-3 py-2 custom-scrollbar">
                {sessions.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 opacity-30">
                    <MessageCircle className="h-8 w-8 mb-2" />
                    <p className="text-xs italic">No sessions yet</p>
                  </div>
                )}
                <div className="space-y-1 pb-4">
                  {sessions.map(s => (
                    <div key={s.id} onClick={() => switchSession(s.id)}
                      className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${
                        s.id === activeId 
                          ? 'bg-primary/10 border-primary/30 text-primary-foreground shadow-sm' 
                          : 'border-transparent hover:bg-white/5 text-muted-foreground hover:text-foreground'
                      }`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <MessageSquare className={`h-4 w-4 shrink-0 ${s.id === activeId ? 'text-primary' : 'text-muted-foreground/50'}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{s.title || 'Untitled Session'}</p>
                          <p className="text-[10px] opacity-50">{new Date(s.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                        onClick={e => { e.stopPropagation(); deleteSession(s.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* App Branding */}
          <div className="flex items-center gap-2 px-1 group cursor-default">
            <VoraLogo size={30} hideText={true} />
            <div className="flex gap-2 items-center">
              <span className="text-xs font-bold leading-none tracking-tight text-foreground">VORA</span>
              <div className="flex items-center gap-1.5 px-2 py-0.5">
                <div className={`w-1 h-1 rounded-full animate-pulse shadow-[0_0_5px_var(--primary)] ${loading ? 'bg-primary' : 'bg-emerald-500 shadow-emerald-500'}`} />
                <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${loading ? 'text-primary' : 'text-muted-foreground'}`}>
                  {loading ? 'Thinking' : 'Online'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center Tabs */}
        <div className="flex-none flex justify-center items-center">
          <Tabs value={mode} onValueChange={v => setMode(v as 'chat' | 'voice')} className="bg-muted/50 p-0.5 rounded-lg border border-border/50">
            <TabsList className="h-8 bg-transparent gap-1">
              <TabsTrigger value="chat" className="text-[10px] font-bold uppercase tracking-wider h-7 px-3 gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
                <MessageCircle className="h-3 w-3" /> Chat
              </TabsTrigger>
              <TabsTrigger value="voice" className="text-[10px] font-bold uppercase tracking-wider h-7 px-3 gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
                <AudioLines className="h-3 w-3" /> Voice
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 flex items-center justify-end gap-1">
          {/* Settings Sidebar Trigger */}
          <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <Settings className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[320px] p-0 flex flex-col border-l border-border bg-card overflow-hidden">
              <SheetHeader className="p-4 border-b border-border">
                <SheetTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Settings Area</SheetTitle>
              </SheetHeader>
              
              <div className="flex-1 overflow-y-auto min-h-0 px-4 py-6 custom-scrollbar">
                <div className="space-y-6">
                  {/* Phase 1 Check */}
                  <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.03] space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">🧪 Self-Check</p>
                      <Button variant="outline" size="xs" onClick={runPhase1SelfCheck} disabled={checkingPhase1} className="text-[9px] h-6 px-2.5">
                        {checkingPhase1 ? 'Checking...' : 'Run Diagnostics'}
                      </Button>
                    </div>
                    {phase1Check && (
                      <div className="space-y-2">
                        <div className={`text-[10px] font-bold p-2 py-1 rounded-md text-center uppercase tracking-tighter ${phase1Check.overall_ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                          Overall Result: {phase1Check.overall_ok ? 'Healthy' : 'Check Warnings'}
                        </div>
                        <div className="space-y-1">
                          {phase1Check.items.map(item => (
                            <div key={item.key} className="flex flex-col p-2 rounded-lg border border-white/5 bg-white/[0.02]">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-medium">{item.label}</span>
                                {item.ok ? <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" /> : <div className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                              </div>
                              <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{item.message}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Privacy Toggle */}
                  <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.03] space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">🔒 Privacy Hub</p>
                      <Badge variant={privacyEnabled ? 'default' : 'outline'} className={`text-[9px] ${privacyEnabled ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' : 'text-red-400 border-red-500/20'}`}>
                        {privacyEnabled ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug italic">
                      {privacyEnabled 
                        ? 'All pipelines enabled. Voice detection and outbound tools active.' 
                        : 'VORA is strictly waiting. Wake word and outbound engines are paused.'}
                    </p>
                    <Button 
                      variant={privacyEnabled ? 'destructive' : 'default'} 
                      size="sm" 
                      onClick={togglePrivacy} 
                      className={`w-full text-xs font-bold uppercase tracking-widest ${privacyEnabled ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20' : 'border-white/10'}`}
                    >
                      {privacyEnabled ? 'Enter Pause Mode' : 'Resume Normal Operations'}
                    </Button>
                  </div>

                  {/* Network Config */}
                  <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.03] space-y-4">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">⚡ Gateway Protocol</p>
                    <FieldGroup label="Access Mode" icon={<Globe className="h-3 w-3" />}>
                      <div className="flex gap-2">
                        {['local', 'cloud'].map(m => (
                          <Button key={m} size="sm" variant={cfg.gateway_mode === m ? 'secondary' : 'outline'}
                            className={`flex-1 text-[10px] font-bold uppercase tracking-widest h-8 border-white/5 ${cfg.gateway_mode === m ? 'bg-primary/20 text-primary border-primary/30' : ''}`}
                            onClick={() => setCfg({ ...cfg, gateway_mode: m })}>{m}</Button>
                        ))}
                      </div>
                    </FieldGroup>
                    <FieldGroup label="Port Binding" icon={<Server className="h-3 w-3" />}>
                      <Input type="number" value={cfg.gateway_port} onChange={e => setCfg({ ...cfg, gateway_port: parseInt(e.target.value) || 27106 })} 
                        className="bg-white/5 border-white/10 h-9 font-mono text-xs focus:ring-1 focus:ring-primary/50" />
                    </FieldGroup>
                  </div>

                  {/* AI Intelligence */}
                  <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.03] space-y-4">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">🧠 Intelligence</p>
                    <FieldGroup label="Core Provider" icon={<Cpu className="h-3 w-3" />}>
                      <div className="flex gap-2">
                        {['ollama', 'groq'].map(p => (
                          <Button key={p} size="sm" variant={cfg.provider === p ? 'secondary' : 'outline'}
                            className={`flex-1 text-[10px] font-bold uppercase tracking-widest h-8 border-white/5 ${cfg.provider === p ? 'bg-primary/20 text-primary border-primary/30' : ''}`}
                            onClick={() => setCfg({ ...cfg, provider: p })}>{p}</Button>
                        ))}
                      </div>
                    </FieldGroup>
                    {cfg.provider === 'groq' && (
                      <FieldGroup 
                        label="Cloud API Token" 
                        icon={<Key className="h-3 w-3" />}
                        action={
                          <button onClick={() => setShowGroq(!showGroq)} className="opacity-40 hover:opacity-100 transition-opacity">
                            {showGroq ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                        }
                      >
                        <Input 
                          type={showGroq ? 'text' : 'password'} 
                          value={cfg.groq_api_key} 
                          placeholder="gsk_..." 
                          onChange={e => setCfg({ ...cfg, groq_api_key: e.target.value })}
                          className="bg-white/5 border-white/10 h-9 text-xs focus:ring-1 focus:ring-primary/50" 
                        />
                      </FieldGroup>
                    )}
                    {cfg.provider === 'ollama' && (
                      <div className="space-y-3">
                        <FieldGroup label="Model Target" icon={<Bot className="h-3 w-3" />}>
                          <Input value={cfg.ollama_model} placeholder="llama3.2" 
                             onChange={e => setCfg({ ...cfg, ollama_model: e.target.value })}
                             className="bg-white/5 border-white/10 h-9 text-xs focus:ring-1 focus:ring-primary/50" />
                        </FieldGroup>
                        <FieldGroup label="Base URL" icon={<Globe className="h-3 w-3" />}>
                          <Input value={cfg.ollama_base_url} placeholder="http://localhost:11434" 
                            onChange={e => setCfg({ ...cfg, ollama_base_url: e.target.value })}
                            className="bg-white/5 border-white/10 h-9 text-xs font-mono focus:ring-1 focus:ring-primary/50" />
                        </FieldGroup>
                      </div>
                    )}
                  </div>

                  {/* Comms */}
                  <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.03] space-y-4">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">📡 Broadcast Channels</p>
                    <FieldGroup 
                      label="Telegram Token" 
                      icon={<Send className="h-3 w-3" />}
                      action={
                        <button onClick={() => setShowTele(!showTele)} className="opacity-40 hover:opacity-100 transition-opacity">
                          {showTele ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                      }
                    >
                      <Input 
                        type={showTele ? 'text' : 'password'} 
                        value={cfg.telegram_token} 
                        placeholder="bot_..." 
                        onChange={e => setCfg({ ...cfg, telegram_token: e.target.value })}
                        className="bg-white/5 border-white/10 h-9 text-xs focus:ring-1 focus:ring-primary/50" 
                      />
                    </FieldGroup>
                    <FieldGroup 
                      label="Discord Secret" 
                      icon={<Hash className="h-3 w-3" />}
                      action={
                        <button onClick={() => setShowDiscord(!showDiscord)} className="opacity-40 hover:opacity-100 transition-opacity">
                          {showDiscord ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                      }
                    >
                      <Input 
                        type={showDiscord ? 'text' : 'password'} 
                        value={cfg.discord_token} 
                        placeholder="Token" 
                        onChange={e => setCfg({ ...cfg, discord_token: e.target.value })}
                        className="bg-white/5 border-white/10 h-9 text-xs focus:ring-1 focus:ring-primary/50" 
                      />
                    </FieldGroup>
                    <FieldGroup label="Guild Scope" icon={<Hash className="h-3 w-3" />}>
                      <Input value={cfg.discord_guild} placeholder="Guild ID" 
                        onChange={e => setCfg({ ...cfg, discord_guild: e.target.value })}
                        className="bg-white/5 border-white/10 h-9 text-[10px] font-mono focus:ring-1 focus:ring-primary/50" />
                    </FieldGroup>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-border bg-muted/30 shrink-0">
                <Button 
                  variant="default" 
                  onClick={saveSettings} 
                  disabled={saving}
                  className="w-full gap-2 font-bold uppercase tracking-widest py-6 relative overflow-hidden"
                >
                  {saving ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Syncing...
                    </div>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> {saved ? 'System Updated' : 'Apply Changes'}
                    </>
                  )}
                </Button>
                <p className="text-[9px] text-center text-muted-foreground mt-3 italic uppercase tracking-tighter opacity-50">Config persists in secure local vault</p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* ─── Main Content Area ─── */}
      <main className="flex-1 relative flex flex-col overflow-hidden">
        {/* ─── CHAT MODE ─── */}
        {mode === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0 relative">
            {/* Scrollable Message Area */}
            <div 
              ref={scrollRef as any}
              className="flex-1 overflow-y-auto custom-scrollbar px-4 scroll-smooth"
            >
              <div className="max-w-2xl mx-auto space-y-6 pt-6 pb-40">
                {messages.length === 0 && (
                  <div className="bg-card/30 border border-white/5 rounded-3xl p-8 flex flex-col items-center gap-4 text-center mt-20 animate-in fade-in zoom-in duration-500">
                    <div className="relative group">
                      <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                      <VoraLogo size={64} hideText={true} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold tracking-tight">VORA AI Agent</h2>
                      <p className="text-sm text-muted-foreground mt-1 max-w-[240px]">Connected via {cfg.provider || 'system'}. Initialized and waiting for protocols.</p>
                    </div>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 fade-in duration-300`}>
                    <div className={`flex items-center gap-2 mb-1 px-1`}>
                       <span className={`text-[9px] font-bold uppercase tracking-widest opacity-40`}>
                         {msg.role === 'user' ? 'Operator' : 'VORA_Core'}
                       </span>
                    </div>
                    <div className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-sm border ${
                      msg.role === 'user'
                        ? 'bg-primary border-primary/20 text-primary-foreground rounded-tr-sm'
                        : 'bg-card border-border text-foreground rounded-tl-sm'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start animate-in fade-in duration-200">
                    <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex gap-1.5 py-1">
                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-duration:0.6s]" />
                        <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.2s]" />
                        <div className="w-1.5 h-1.5 bg-primary/30 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.4s]" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Input Bar (Fixed to Bottom) */}
            <div className="fixed bottom-0 left-0 right-0 p-4 pt-2 bg-gradient-to-t from-background via-background/90 to-transparent z-50">
              <div className="max-w-2xl w-full mx-auto">
                <div className="relative flex items-end gap-2 bg-card/60 backdrop-blur-2xl border border-white/10 rounded-2xl p-1.5 shadow-xl">
                   <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => { setInput(e.target.value); autoResize(); }}
                    onKeyDown={handleKeyDown}
                    placeholder={privacyEnabled ? 'Command VORA...' : 'Protocols locked · Wake word only'}
                    className="flex-1 bg-transparent border-0 ring-0 focus:ring-0 outline-none focus:outline-none text-sm px-3 py-2.5 max-h-32 min-h-[42px] resize-none placeholder:text-muted-foreground/40 disabled:opacity-50"
                    rows={1}
                    disabled={loading || !privacyEnabled}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="secondary" 
                        size="icon" 
                        className="h-9 w-9 shrink-0 rounded-xl bg-white text-black"
                        disabled={loading || !input.trim() || !privacyEnabled}
                        onClick={() => sendMessage(input)}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Execute Command</TooltipContent>
                  </Tooltip>
                </div>
                {!privacyEnabled && (
                  <p className="text-[9px] text-amber-500/70 text-center mt-2 font-bold uppercase tracking-widest">
                     System Locked: Enable Privacy Mode in settings to resume terminal access
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── VOICE MODE ─── */}
        {mode === 'voice' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse" />
              
              <div className="z-10 flex flex-col items-center gap-10">
                <div className="text-center space-y-2">
                   <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/60">
                    Neural Interface 0.1
                  </p>
                  <p className="text-xl font-bold tracking-tight">
                    {listening ? 'Neural Stream Open' : 'Waiting for Signal'}
                  </p>
                </div>

                <div 
                   className={`relative cursor-pointer group transition-all duration-500 rounded-full p-1 border-2 ${
                     listening ? 'border-primary shadow-[0_0_40px_rgba(108,92,231,0.3)]' : 'border-white/10'
                   }`}
                   onClick={toggleVoice}
                >
                  <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all bg-card/50 backdrop-blur-xl ${
                    listening ? 'scale-90' : 'scale-100'
                  }`}>
                    {listening ? <MicOff className="h-10 w-10 text-primary" /> : <Mic className="h-10 w-10 text-muted-foreground" />}
                    
                    {/* Animated waves while listening */}
                    {listening && (
                      <div className="absolute inset-0 -z-10">
                        <div className="absolute inset-0 rounded-full border border-primary animate-ping opacity-20" />
                        <div className="absolute inset-2 rounded-full border border-primary animate-ping [animation-delay:0.3s] opacity-10" />
                      </div>
                    )}
                  </div>
                </div>

                {voiceText && (
                  <p className="text-base font-medium italic text-foreground text-center max-w-sm animate-in fade-in slide-in-from-bottom-2 px-4 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                    "{voiceText}"
                  </p>
                )}

                <div className="flex flex-col items-center gap-4 mt-4">
                  <Button 
                    variant={wakeRunning ? 'secondary' : 'outline'} 
                    size="sm" 
                    onClick={toggleWakeEngine}
                    className={`h-9 px-6 gap-2 rounded-full border-white/10 text-[10px] uppercase font-black tracking-widest ${wakeRunning ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : ''}`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${wakeRunning ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground/30'}`} />
                    {wakeRunning ? 'Neural Wake ACTIVE' : 'Init Wake Engine'}
                  </Button>
                  <div className="flex flex-col items-center gap-1.5">
                    <p className="text-[9px] text-muted-foreground uppercase font-medium tracking-widest">{wakeStatus}</p>
                    <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
                      <div className="h-full bg-primary transition-all duration-150 shadow-[0_0_5px_var(--primary)]" style={{ width: `${wakeVolume}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Transcript Area */}
            <div className="bg-card/30 border-t border-border/50 shrink-0">
               <div className="max-w-xl mx-auto p-4">
                 <div className="flex items-center justify-between mb-2">
                   <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Terminal Stream</p>
                   <Badge variant="outline" className="text-[8px] h-4">STT: {sttSupported ? 'Ready' : 'Inert'}</Badge>
                 </div>
                 <ScrollArea className="h-28 rounded-xl bg-black/20 border border-white/5 p-2">
                    <div className="space-y-1">
                      {transcriptLog.length === 0 && <p className="text-[10px] text-muted-foreground italic px-1">Neural channel empty...</p>}
                      {transcriptLog.map((line, idx) => (
                        <p key={idx} className="text-[10px] font-mono text-muted-foreground/80 leading-tight">
                          <span className="text-primary/70 opacity-50">{line.slice(0, 8)}</span>
                          <span className="ml-2">{line.slice(10)}</span>
                        </p>
                      ))}
                    </div>
                 </ScrollArea>
               </div>
            </div>
          </div>
        )}
      </main>

      {/* ─── Security Confirmation Overlay ─── */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-card shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-destructive/10 flex items-center justify-center border border-destructive/20 text-destructive">
                <Shield className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-destructive/80">Security Protocol 402</p>
                <h3 className="text-sm font-bold tracking-tight">Vora Requesting Approval</h3>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-muted/30 border border-border space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Requested Action</p>
                <p className="text-sm font-semibold">{pendingConfirm.action}</p>
              </div>
              
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{pendingConfirm.reason}</p>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 bg-red-400/5 px-2 py-1 rounded-md border border-red-400/10 w-fit">
                  <span className="uppercase">Risk Profile:</span> {pendingConfirm.risk}
                </div>
              </div>

              {pendingConfirm.prompt_preview && (
                <div className="rounded-2xl bg-black/30 border border-white/5 p-3">
                   <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mb-1 opacity-50">Operation Source</p>
                   <p className="text-[10px] font-mono text-white/70 leading-relaxed whitespace-pre-wrap">{pendingConfirm.prompt_preview}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => resolveConfirm(false)}
                className="flex-1 rounded-2xl h-12 uppercase tracking-widest font-black text-xs border-white/10 hover:bg-white/5"
              >
                Deny
              </Button>
              <Button
                variant="primary"
                onClick={() => resolveConfirm(true)}
                className="flex-1 rounded-2xl h-12 uppercase tracking-widest font-black text-xs bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-500/20"
              >
                Allow Neural Access
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
