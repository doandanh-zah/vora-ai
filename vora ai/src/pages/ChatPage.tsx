import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Send, Mic, MicOff, MessageSquare, AudioLines, Settings,
  Sparkles, Trash2, Save, Menu, Key, Server, Cpu, Plus,
  MessageCircle, Globe, Hash, Bot
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type Session = { id: string; title: string; created_at: string; messages: ChatMessage[] };

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

  const [cfg, setCfg] = useState({
    provider: 'groq', groq_api_key: '', ollama_model: 'llama3.2',
    ollama_base_url: 'http://localhost:11434', gateway_mode: 'local',
    gateway_port: 27106, telegram_token: '', discord_token: '', discord_guild: ''
  });
  const [saved, setSaved] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
      } catch (e) { console.error(e); }
      await refreshSessions(true);
    })();
  }, []);

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

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    setInput('');
    setMessages(p => [...p, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const reply = await invoke<string>('send_chat', { prompt: text });
      setMessages(p => [...p, { role: 'assistant', content: reply }]);
      refreshSessions();
    } catch (e: any) {
      setMessages(p => [...p, { role: 'assistant', content: `Error: ${e}` }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const saveSettings = async () => {
    await invoke('update_settings', {
      provider: cfg.provider, groqApiKey: cfg.groq_api_key, ollamaModel: cfg.ollama_model,
      ollamaBaseUrl: cfg.ollama_base_url, gatewayMode: cfg.gateway_mode, gatewayPort: cfg.gateway_port,
      telegramToken: cfg.telegram_token, discordToken: cfg.discord_token, discordGuild: cfg.discord_guild,
    });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const toggleVoice = () => {
    if (listening) {
      setListening(false);
      if (voiceText && voiceText !== 'Listening...') sendMessage(voiceText);
      setVoiceText('');
    } else {
      setListening(true); setVoiceText('Listening...');
      setTimeout(() => {
        setVoiceText('Hello VORA');
        setTimeout(() => { setListening(false); sendMessage('Hello VORA'); setVoiceText(''); }, 1500);
      }, 2000);
    }
  };

  const FieldGroup = ({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1.5">{icon} {label}</Label>
      {children}
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* ─── Header ─── */}
      <header className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/80 backdrop-blur-xl shrink-0 z-10">
        <div className="flex items-center gap-2">
          {/* Sessions sidebar */}
          <Sheet open={sideOpen} onOpenChange={setSideOpen}>
            <SheetTrigger asChild>
              <Button variant="default" size="icon" className="h-8 w-8">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>

            <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
              <SheetHeader className="p-4 pb-2">
                <SheetTitle className="text-xs uppercase tracking-widest text-muted-foreground">Sessions</SheetTitle>
              </SheetHeader>

              <div className="px-3 pb-2">
                <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={newChat}>
                  <Plus className="h-3.5 w-3.5" /> New Chat
                </Button>
              </div>

              <Separator />

              <ScrollArea className="flex-1 px-3 py-2">
                {sessions.length === 0 && <p className="text-muted-foreground text-xs text-center py-8 italic">No sessions yet</p>}
                <div className="space-y-1">
                  {sessions.map(s => (
                    <div key={s.id} onClick={() => switchSession(s.id)}
                      className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                        s.id === activeId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                      }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <MessageCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{s.title}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="destructive" size="icon" className="h-6 w-6"
                            onClick={e => { e.stopPropagation(); deleteSession(s.id); }}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>

          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold leading-none">VORA</h1>
            <p className="text-[10px] text-muted-foreground">{loading ? 'Thinking...' : 'Online'}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Tabs value={mode} onValueChange={v => setMode(v as 'chat' | 'voice')}>
            <TabsList className="h-7">
              <TabsTrigger value="chat" className="text-[11px] px-2.5 gap-1 h-6">
                <MessageSquare className="h-3 w-3" /> Chat
              </TabsTrigger>
              <TabsTrigger value="voice" className="text-[11px] px-2.5 gap-1 h-6">
                <AudioLines className="h-3 w-3" /> Voice
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Settings */}
          <Sheet open={settingsOpen} onOpenChange={setSettingsOpen} >
            <SheetTrigger asChild>
              <Button variant="default" size="icon" className="h-8 w-8">
                <Settings className="h-4 w-4" />
              </Button>
            </SheetTrigger>

            <SheetContent className="w-[320px] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>
                  Settings
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-5 p-4">
                <div className="space-y-3 p-3 rounded-xl border border-border bg-card">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">⚡ Gateway</p>
                  <FieldGroup label="Mode" icon={<Globe className="h-3 w-3" />}>
                    <div className="flex gap-2">
                      {['local', 'cloud'].map(m => (
                        <Button key={m} size="sm" variant={cfg.gateway_mode === m ? 'default' : 'outline'}
                          className="flex-1 text-xs uppercase" onClick={() => setCfg({ ...cfg, gateway_mode: m })}>{m}</Button>
                      ))}
                    </div>
                  </FieldGroup>

                  <FieldGroup label="Port" icon={<Server className="h-3 w-3" />}>
                    <Input type="number" value={cfg.gateway_port} onChange={e => setCfg({ ...cfg, gateway_port: parseInt(e.target.value) || 27106 })} className="font-mono text-sm" />
                  </FieldGroup>
                </div>

                <div className="space-y-3 p-3 rounded-xl border border-border bg-card">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">🧠 Provider</p>
                  <FieldGroup label="Provider" icon={<Cpu className="h-3 w-3" />}>
                    <div className="flex gap-2">
                      {['ollama', 'groq'].map(p => (
                        <Button key={p} size="sm" variant={cfg.provider === p ? 'default' : 'outline'}
                          className="flex-1 text-xs uppercase" onClick={() => setCfg({ ...cfg, provider: p })}>{p}</Button>
                      ))}
                    </div>
                  </FieldGroup>
                  {cfg.provider === 'groq' && (
                    <FieldGroup label="API Key" icon={<Key className="h-3 w-3" />}>
                      <Input type="password" value={cfg.groq_api_key} placeholder="gsk_..." onChange={e => setCfg({ ...cfg, groq_api_key: e.target.value })} />
                    </FieldGroup>
                  )}
                  {cfg.provider === 'ollama' && (
                    <>
                      <FieldGroup label="Model" icon={<Bot className="h-3 w-3" />}>
                        <Input value={cfg.ollama_model} placeholder="llama3.2" onChange={e => setCfg({ ...cfg, ollama_model: e.target.value })} />
                      </FieldGroup>
                      <FieldGroup label="Base URL" icon={<Globe className="h-3 w-3" />}>
                        <Input value={cfg.ollama_base_url} placeholder="http://localhost:11434" onChange={e => setCfg({ ...cfg, ollama_base_url: e.target.value })} />
                      </FieldGroup>
                    </>
                  )}
                </div>

                <div className="space-y-3 p-3 rounded-xl border border-border bg-card">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">📡 Channels</p>
                  <FieldGroup label="Telegram Token" icon={<Send className="h-3 w-3" />}>
                    <Input type="password" value={cfg.telegram_token} placeholder="Optional" onChange={e => setCfg({ ...cfg, telegram_token: e.target.value })} />
                  </FieldGroup>
                  <FieldGroup label="Discord Token" icon={<Hash className="h-3 w-3" />}>
                    <Input type="password" value={cfg.discord_token} placeholder="Optional" onChange={e => setCfg({ ...cfg, discord_token: e.target.value })} />
                  </FieldGroup>
                  <FieldGroup label="Guild ID" icon={<Hash className="h-3 w-3" />}>
                    <Input value={cfg.discord_guild} placeholder="Optional" onChange={e => setCfg({ ...cfg, discord_guild: e.target.value })} />
                  </FieldGroup>
                </div>

                <Button variant="default" onClick={saveSettings} className="w-full gap-2">
                  <Save className="h-4 w-4" /> {saved ? '✓ Saved!' : 'Save All'}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* ─── Chat ─── */}
      {mode === 'chat' && (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40">
                <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">Start a conversation</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] sm:max-w-[70%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-muted text-foreground rounded-bl-sm'
                }`}>{msg.content}</div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-3.5 py-2.5">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:150ms]" />
                    <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-end gap-2 p-3 border-t border-border bg-card/80 backdrop-blur-xl shrink-0">
            <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Message VORA..." rows={1} disabled={loading}
              className="flex-1 resize-none min-h-[40px] max-h-[120px] rounded-xl bg-muted border border-border px-3 py-2.5 text-sm outline-none focus:border-ring transition-colors placeholder:text-muted-foreground" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="default" size="icon" onClick={() => sendMessage(input)} disabled={loading || !input.trim()} className="h-10 w-10 rounded-xl shrink-0">
                  <Send className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Send</TooltipContent>
            </Tooltip>
          </div>
        </>
      )}

      {/* ─── Voice ─── */}
      {mode === 'voice' && (
        <>
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] font-semibold">
              {listening ? 'Listening...' : 'Tap to speak'}
            </p>
            <button onClick={toggleVoice}
              className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                listening ? 'bg-primary shadow-[0_0_40px_hsl(var(--primary)/0.3)]' : 'bg-muted hover:bg-muted/80'
              }`}>
              {listening && <span className="absolute inset-[-8px] rounded-full border-2 border-primary/30 animate-ping" />}
              {listening ? <MicOff className="h-8 w-8 text-primary-foreground" /> : <Mic className="h-8 w-8 text-muted-foreground" />}
            </button>
            {voiceText && <p className="text-sm italic text-muted-foreground text-center max-w-[240px]">"{voiceText}"</p>}
            <Badge variant="outline" className="text-[10px] uppercase tracking-widest">Demo</Badge>
          </div>
          <ScrollArea className="max-h-[25vh] px-4 pb-3">
            {messages.slice(-4).map((m, i) => (
              <div key={i} className={`flex mb-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs ${
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}>{m.content}</div>
              </div>
            ))}
          </ScrollArea>
        </>
      )}
    </div>
  );
};
