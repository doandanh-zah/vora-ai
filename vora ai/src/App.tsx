import { useState, useEffect } from 'react';
import { VoraLogo } from './components/VoraLogo';
import { Step1GatewaySelect } from './onboarding/steps/Step1GatewaySelect';
import { Step2GatewayConfig } from './onboarding/steps/Step2GatewayConfig';
import { Step3ProviderSelect } from './onboarding/steps/Step3ProviderSelect';
import { Step4ProviderSetup } from './onboarding/steps/Step4ProviderSetup';
import { Step5Channels } from './onboarding/steps/Step5Channels';
import { Step6HatchTest } from './onboarding/steps/Step6HatchTest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ArrowRight } from 'lucide-react';

export default function App() {
  const [currentStep, setCurrentStep] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installStatus, setInstallStatus] = useState('');
  const [setupState, setSetupState] = useState<any>({
    gatewayMode: 'local',
    provider: 'ollama',
  });

  useEffect(() => {
    const unlisten = listen('setup-event', (event: any) => {
      const payload = event.payload;
      console.log('Setup Event:', payload);
      setInstallStatus(payload.message);
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  const nextStep = () => setCurrentStep(prev => prev + 1);
  const prevStep = () => setCurrentStep(prev => Math.max(0, prev - 1));

  const startSession = async () => {
    try {
      setIsInstalling(true);
      setInstallStatus('Initializing Vora Setup...');
      const sid = await invoke<string>('start_setup_session');
      setSessionId(sid);
      setTimeout(() => {
        setIsInstalling(false);
        nextStep();
      }, 1000);
    } catch (e) {
      console.error(e);
      setInstallStatus('Failed to start session.');
    }
  };

  const handleGatewayMode = async (mode: string) => {
    await invoke('select_gateway_mode', { mode });
    setSetupState({ ...setupState, gatewayMode: mode });
    nextStep();
  };

  const handleSetPort = async (port: number) => {
    await invoke('set_gateway_port', { port });
  };

  const handleInstallService = async () => {
    await invoke('install_gateway_service', { sessionId });
  };

  const handleStartService = async () => {
    // In a real app, this would trigger a background task
    await new Promise(resolve => setTimeout(resolve, 1500));
  };

  const handleProviderSelect = async (provider: string) => {
    await invoke('select_model_provider', { provider });
    setSetupState({ ...setupState, provider });
    nextStep();
  };

  const handleSaveKey = async (key: string) => {
    await invoke('save_groq_api_key', { key });
  };

  const handleCheckOllama = async () => {
    return await invoke<boolean>('verify_ollama_installed', { sessionId });
  };

  const handleHatchTest = async (prompt: string) => {
    return await invoke<string>('hatch_test_prompt', { prompt });
  };

  const handleFinish = async () => {
    await invoke('commit_setup_config');
    alert('Setup Complete! Vora is ready.');
  };

  return (
    <div className="onboarding-container">
      {currentStep === 0 && (
        <div className="flex flex-col items-center animate-in fade-in zoom-in duration-700">
          <VoraLogo size={180} />
          <div className="mt-20 flex flex-col items-center gap-6">
            {!isInstalling ? (
              <button 
                onClick={startSession}
                className="btn-primary text-xl px-4 py-2 flex items-center justify-center gap-2"
              >
                Start Setup
                <ArrowRight size={20}/>
              </button>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-white animate-pulse" style={{ width: '40%' }}></div>
                </div>
                <p className="text-white/70 italic text-sm tracking-widest uppercase">
                  {installStatus}
                </p>
              </div>
            )}
            <p className="text-white/40 text-xs mt-4 uppercase tracking-[0.3em]">
              VERSION 1.0.0
            </p>
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <Step1GatewaySelect 
          onNext={handleGatewayMode} 
          onPrev={prevStep} 
        />
      )}

      {currentStep === 2 && (
        <Step2GatewayConfig 
          onNext={nextStep} 
          onPrev={prevStep}
          onSetPort={handleSetPort}
          onInstallService={handleInstallService}
          onStartService={handleStartService}
        />
      )}

      {currentStep === 3 && (
        <Step3ProviderSelect 
          onNext={handleProviderSelect} 
          onPrev={prevStep} 
        />
      )}

      {currentStep === 4 && (
        <Step4ProviderSetup 
          provider={setupState.provider}
          onNext={nextStep}
          onPrev={prevStep}
          onSaveKey={handleSaveKey}
          onCheckOllama={handleCheckOllama}
        />
      )}

      {currentStep === 5 && (
        <Step5Channels 
          onNext={nextStep}
          onPrev={prevStep}
        />
      )}

      {currentStep === 6 && (
        <Step6HatchTest 
          onFinish={handleFinish}
          onHatchTest={handleHatchTest}
        />
      )}
    </div>
  );
}