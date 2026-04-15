import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ArrowRight, ArrowLeft, Server, Globe, Cpu, Key, Wifi, Hash, Send, Sparkles, CheckCircle2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { VoraLogo } from './components/VoraLogo';
import { ChatPage } from './pages/ChatPage';


type AppView = 'onboarding' | 'chat';

// --- Shared UI Components (outside App to avoid re-creation) ---

const StepCard = ({ children, title, subtitle }: { children: React.ReactNode; title?: string; subtitle?: string }) => (
  <div className="w-full max-w-md mx-auto p-6 rounded-2xl border border-border bg-card/80 backdrop-blur-xl shadow-2xl">
    {title && (
      <div className="mb-6">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
    )}
    {children}
  </div>
);

const NavButtons = ({ canNext = true, nextLabel = 'Continue', onNext, onPrev, showBack = true }: {
  canNext?: boolean; nextLabel?: string; onNext: () => void; onPrev: () => void; showBack?: boolean;
}) => (
  <div className="flex gap-3 mt-8">
    {showBack && (
      <Button variant="outline" onClick={onPrev} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>
    )}
    <Button variant="default" onClick={onNext} disabled={!canNext} className="flex-1 gap-1.5">
      {nextLabel} <ArrowRight className="h-4 w-4" />
    </Button>
  </div>
);

const RadioOption = ({ value, current, onSelect, icon, title, desc, disabled = false }: {
  value: string; current: string; onSelect: (v: string) => void;
  icon: React.ReactNode; title: string; desc: string; disabled?: boolean;
}) => (
  <button
    onClick={() => !disabled && onSelect(value)}
    disabled={disabled}
    className={`w-full flex items-center gap-3.5 p-3.5 rounded-xl border transition-all text-left ${
      current === value
        ? 'bg-primary/10 border-primary text-foreground'
        : disabled
          ? 'bg-muted/30 border-border/50 opacity-40 cursor-not-allowed'
          : 'bg-card border-border hover:bg-muted/50 hover:border-border'
    }`}
  >
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
      current === value ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
    }`}>{icon}</div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-[11px] text-muted-foreground truncate">{desc}</p>
    </div>
    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
      current === value ? 'border-primary' : 'border-muted-foreground/30'
    }`}>
      {current === value && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
    </div>
  </button>
);

const StepIndicator = ({ step, total }: { step: number; total: number }) => (
  <div className="flex items-center gap-1.5 mb-6 justify-center">
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} className={`h-1 rounded-full transition-all ${
        i <= step ? 'bg-primary w-6' : 'bg-muted w-3'
      }`} />
    ))}
  </div>
);

export default function App() {
  const [view, setView] = useState<AppView>('onboarding');
  const [step, setStep] = useState(0);
  const [isInit, setIsInit] = useState(false);
  const [initStatus, setInitStatus] = useState('');

  // Setup state
  const [mode, setMode] = useState('local');
  const [provider, setProvider] = useState('groq');
  const [groqKey, setGroqKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [ollamaModel, setOllamaModel] = useState('llama3.2');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [port, setPort] = useState(27106);
  const [telegramToken, setTelegramToken] = useState('');
  const [discordToken, setDiscordToken] = useState('');
  const [discordGuild, setDiscordGuild] = useState('');

  // Hatch test
  const [hatchMessages, setHatchMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: "I'm VORA. Soul loaded. Ready to go." }
  ]);
  const [hatchInput, setHatchInput] = useState('');
  const [hatchLoading, setHatchLoading] = useState(false);
  const hatchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await invoke<any>('get_setup_status');
        if (s.is_completed) setView('chat');
      } catch (e) { console.error(e); }
    })();
    const unlisten = listen('setup-event', (e: any) => setInitStatus(e.payload.message));
    return () => { unlisten.then(f => f()); };
  }, []);

  useEffect(() => {
    if (hatchRef.current) hatchRef.current.scrollTop = hatchRef.current.scrollHeight;
  }, [hatchMessages, hatchLoading]);

  const next = () => setStep(s => s + 1);
  const prev = () => setStep(s => Math.max(0, s - 1));

  const startSetup = async () => {
    setIsInit(true);
    setInitStatus('Initializing...');
    try {
      await invoke<string>('start_setup_session');
      setTimeout(() => { setIsInit(false); next(); }, 600);
    } catch { setInitStatus('Failed.'); }
  };

  const handleHatch = async () => {
    if (!hatchInput.trim() || hatchLoading) return;
    const text = hatchInput;
    setHatchInput('');
    setHatchMessages(p => [...p, { role: 'user', content: text }]);
    setHatchLoading(true);
    try {
      const reply = await invoke<string>('hatch_test_prompt', { prompt: text });
      setHatchMessages(p => [...p, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setHatchMessages(p => [...p, { role: 'assistant', content: `Error: ${e}` }]);
    }
    setHatchLoading(false);
  };

  const finish = async () => {
    await invoke('select_model_provider', { provider });
    if (provider === 'groq') await invoke('save_groq_api_key', { key: groqKey });
    await invoke('set_gateway_port', { port });
    await invoke('update_settings', {
      provider, groqApiKey: groqKey, ollamaModel, ollamaBaseUrl: ollamaUrl,
      gatewayMode: mode, gatewayPort: port,
      telegramToken, discordToken, discordGuild,
    });
    await invoke('commit_setup_config');
    setView('chat');
  };

  if (view === 'chat') return <ChatPage />;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-foreground">
      {step > 0 && <StepIndicator step={step} total={7} />}

      {/* Step 0: Welcome */}
      {step === 0 && (
        <div className="flex flex-col items-center gap-8 animate-in fade-in zoom-in duration-700">
          <VoraLogo size={120} />
          {!isInit ? (
            <Button variant="default" size="lg" onClick={startSetup} className="gap-2 text-base px-8">
              Start Setup <ArrowRight className="h-5 w-5" />
            </Button>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary animate-pulse rounded-full" style={{ width: '50%' }} />
              </div>
              <p className="text-muted-foreground text-xs italic tracking-widest uppercase">{initStatus}</p>
            </div>
          )}
          <Badge variant="outline" className="text-[10px] tracking-[0.2em] uppercase">v1.0.0 · Phase 0.5</Badge>
        </div>
      )}

      {/* Step 1: Security */}
      {step === 1 && (
        <StepCard title="Security Notice" subtitle="Please read before continuing">
          <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 space-y-3">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>VORA is a personal AI agent. By default, it has <strong className="text-foreground">one trusted operator boundary</strong>.</p>
                <p>A bad prompt can trick it into unsafe actions if tools are enabled.</p>
                <p className="text-xs">Recommended: Use pairing/allowlists, sandbox tools, keep secrets out of reachable filesystem.</p>
              </div>
            </div>
          </div>
          <NavButtons nextLabel="I Understand" onNext={next} onPrev={prev} />
        </StepCard>
      )}

      {/* Step 2: Mode */}
      {step === 2 && (
        <StepCard title="Gateway Mode" subtitle="How should VORA connect?">
          <div className="space-y-3">
            <RadioOption value="local" current={mode} onSelect={setMode}
              icon={<Server className="h-5 w-5" />} title="Local Gateway" desc="Run on this machine · Recommended" />
            <RadioOption value="remote" current={mode} onSelect={setMode}
              icon={<Globe className="h-5 w-5" />} title="Remote Gateway" desc="Connect to external server" disabled />
          </div>
          <NavButtons onNext={next} onPrev={prev} />
        </StepCard>
      )}

      {/* Step 3: Provider Select */}
      {step === 3 && (
        <StepCard title="AI Provider" subtitle="Choose your LLM backend">
          <div className="space-y-3">
            <RadioOption value="groq" current={provider} onSelect={setProvider}
              icon={<Cpu className="h-5 w-5" />} title="Groq" desc="Cloud · Fast inference · Free tier" />
            <RadioOption value="ollama" current={provider} onSelect={setProvider}
              icon={<Server className="h-5 w-5" />} title="Ollama" desc="Local · Private · Requires install" />
            <RadioOption value="openai" current={provider} onSelect={setProvider}
              icon={<Sparkles className="h-5 w-5" />} title="OpenAI" desc="GPT-4o · Cloud · Paid" />
          </div>
          <NavButtons onNext={next} onPrev={prev} />
        </StepCard>
      )}

      {/* Step 4: Provider Setup */}
      {step === 4 && (
        <StepCard title="Provider Setup" subtitle={`Configure ${provider}`}>
          <div className="space-y-4">
            {provider === 'groq' && (
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1.5"><Key className="h-3 w-3" /> Groq API Key</Label>
                <Input type="password" value={groqKey} onChange={e => setGroqKey(e.target.value)}
                  placeholder="gsk_..." className="font-mono" />
                <p className="text-[11px] text-muted-foreground">
                  Get one free at <a href="https://console.groq.com" target="_blank" className="text-primary underline">console.groq.com</a>
                </p>
              </div>
            )}
            {provider === 'openai' && (
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1.5"><Key className="h-3 w-3" /> OpenAI API Key</Label>
                <Input type="password" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)}
                  placeholder="sk-..." className="font-mono" />
              </div>
            )}
            {provider === 'ollama' && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs">Model Name</Label>
                  <Input value={ollamaModel} onChange={e => setOllamaModel(e.target.value)} placeholder="llama3.2" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Base URL</Label>
                  <Input value={ollamaUrl} onChange={e => setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434" className="font-mono" />
                </div>
              </>
            )}
          </div>
          <NavButtons canNext={provider === 'ollama' || (provider === 'groq' && !!groqKey) || (provider === 'openai' && !!openaiKey)} onNext={next} onPrev={prev} />
        </StepCard>
      )}

      {/* Step 5: Gateway Config */}
      {step === 5 && (
        <StepCard title="Gateway Config" subtitle="Network settings">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5"><Wifi className="h-3 w-3" /> Gateway Port</Label>
              <Input type="number" value={port} onChange={e => setPort(parseInt(e.target.value) || 27106)} className="font-mono" />
              <p className="text-[11px] text-muted-foreground">Default: 27106 · Bind: loopback (localhost only)</p>
            </div>
          </div>
          <NavButtons onNext={next} onPrev={prev} />
        </StepCard>
      )}

      {/* Step 6: Channels (optional) */}
      {step === 6 && (
        <StepCard title="Channels" subtitle="Optional · Connect messaging platforms">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5"><Send className="h-3 w-3" /> Telegram Bot Token</Label>
              <Input type="password" value={telegramToken} onChange={e => setTelegramToken(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5"><Hash className="h-3 w-3" /> Discord Bot Token</Label>
              <Input type="password" value={discordToken} onChange={e => setDiscordToken(e.target.value)} placeholder="Optional" />
            </div>
            {discordToken && (
              <div className="space-y-2">
                <Label className="text-xs">Discord Guild ID</Label>
                <Input value={discordGuild} onChange={e => setDiscordGuild(e.target.value)} placeholder="Optional" />
              </div>
            )}
          </div>
          <NavButtons nextLabel="Next" onNext={next} onPrev={prev} />
        </StepCard>
      )}

      {/* Step 7: Hatch Test */}
      {step === 7 && (
        <div className="w-full max-w-md mx-auto flex flex-col rounded-2xl border border-border bg-card/80 backdrop-blur-xl shadow-2xl animate-in fade-in duration-300" style={{ maxHeight: '80vh' }}>
          <div className="p-4 border-b border-border flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Hatch Test</h2>
              <p className="text-[10px] text-muted-foreground">Talk to VORA to verify setup</p>
            </div>
          </div>

          <div ref={hatchRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[250px]">
            {hatchMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-muted text-foreground rounded-bl-sm'
                }`}>{m.content}</div>
              </div>
            ))}
            {hatchLoading && (
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

          <div className="p-3 border-t border-border space-y-3">
            <form onSubmit={e => { e.preventDefault(); handleHatch(); }} className="flex gap-2">
              <Input value={hatchInput} onChange={e => setHatchInput(e.target.value)}
                placeholder="Talk to VORA..." disabled={hatchLoading} className="flex-1" />
              <Button type="submit" size="icon" disabled={hatchLoading || !hatchInput.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <Button variant="default" onClick={finish} disabled={hatchMessages.length < 3 || hatchLoading}
              className="w-full gap-2">
              Complete Setup <CheckCircle2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}