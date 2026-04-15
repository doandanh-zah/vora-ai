import { useState, useEffect } from 'react';
import { VoraLogo } from './components/VoraLogo';
import { GatewaySelect } from './onboarding/steps/GatewaySelect';
import { GatewayConfig } from './onboarding/steps/GatewayConfig';
import { ProviderSelect } from './onboarding/steps/ProviderSelect';
import { ProviderSetup } from './onboarding/steps/ProviderSetup';
import { Channels } from './onboarding/steps/Channels';
import { HatchTest } from './onboarding/steps/HatchTest';
import { ChatPage } from './pages/ChatPage';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ArrowRight } from 'lucide-react';

type AppView = 'onboarding' | 'chat';

export default function App() {
  const [view, setView] = useState<AppView>('onboarding');
  const [currentStep, setCurrentStep] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installStatus, setInstallStatus] = useState('');
  const [setupState, setSetupState] = useState<any>({
    gatewayMode: 'local',
    provider: 'ollama',
  });

  useEffect(() => {
    const init = async () => {
      try {
        const status = await invoke<any>('get_setup_status');
        if (status.is_completed) {
          setView('chat'); // Go straight to chat
          setSetupState({ gatewayMode: 'local', provider: status.provider });
        }
      } catch (e) {
        console.error('Failed to load setup status', e);
      }
    };
    init();

    const unlisten = listen('setup-event', (event: any) => {
      setInstallStatus(event.payload.message);
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  const nextStep = () => setCurrentStep(prev => prev + 1);
  const prevStep = () => setCurrentStep(prev => Math.max(0, prev - 1));

  const startSession = async () => {
    setIsInstalling(true);
    setInstallStatus('Initializing...');
    try {
      const sid = await invoke<string>('start_setup_session');
      setSessionId(sid);
      setTimeout(() => { setIsInstalling(false); nextStep(); }, 800);
    } catch (e) {
      console.error(e);
      setInstallStatus('Failed.');
    }
  };

  const handleFinish = async () => {
    await invoke('commit_setup_config');
    setView('chat');
  };

  // --- If setup is done, show Chat ---
  if (view === 'chat') {
    return <ChatPage />;
  }

  // --- Onboarding ---
  return (
    <div className="onboarding-container">
      {currentStep === 0 && (
        <div className="flex flex-col items-center animate-in fade-in zoom-in duration-700">
          <VoraLogo size={140} />
          <div className="mt-16 flex flex-col items-center gap-5">
            {!isInstalling ? (
              <button
                onClick={startSession}
                className="btn-primary text-lg px-8 py-3 flex items-center justify-center gap-2"
              >
                Start Setup <ArrowRight size={18}/>
              </button>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="w-56 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] animate-pulse rounded-full" style={{ width: '45%' }} />
                </div>
                <p className="text-white/50 italic text-xs tracking-widest uppercase">{installStatus}</p>
              </div>
            )}
            <p className="text-white/20 text-[10px] mt-3 uppercase tracking-[0.3em]">v1.0.0 · Phase 0.5</p>
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <GatewaySelect
          onNext={async (mode: string) => {
            await invoke('select_gateway_mode', { mode });
            setSetupState({ ...setupState, gatewayMode: mode });
            nextStep();
          }}
          onPrev={prevStep}
        />
      )}

      {currentStep === 2 && (
        <GatewayConfig
          onNext={nextStep}
          onPrev={prevStep}
          onSetPort={async (port: number) => await invoke('set_gateway_port', { port })}
          onInstallService={async () => await invoke('install_gateway_service', { sessionId })}
          onStartService={async () => await new Promise(r => setTimeout(r, 1200))}
        />
      )}

      {currentStep === 3 && (
        <ProviderSelect
          onNext={async (provider: string) => {
            await invoke('select_model_provider', { provider });
            setSetupState({ ...setupState, provider });
            nextStep();
          }}
          onPrev={prevStep}
        />
      )}

      {currentStep === 4 && (
        <ProviderSetup
          provider={setupState.provider}
          onNext={nextStep}
          onPrev={prevStep}
          onSaveKey={async (key: string) => await invoke('save_groq_api_key', { key })}
          onCheckOllama={async () => await invoke<boolean>('verify_ollama_installed', { sessionId })}
        />
      )}

      {currentStep === 5 && (
        <Channels onNext={nextStep} onPrev={prevStep} />
      )}

      {currentStep === 6 && (
        <HatchTest
          onFinish={handleFinish}
          onHatchTest={async (prompt: string) => await invoke<string>('hatch_test_prompt', { prompt })}
        />
      )}
    </div>
  );
}