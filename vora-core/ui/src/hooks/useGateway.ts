import { useEffect, useState, useRef } from 'react';
import { GatewayBrowserClient, type GatewayEventFrame, type GatewayHelloOk, type GatewayErrorInfo } from '../api/gateway';

export function useGateway() {
  const [connected, setConnected] = useState(false);
  const [helloState, setHelloState] = useState<GatewayHelloOk | null>(null);
  const [error, setError] = useState<GatewayErrorInfo | undefined>(undefined);
  const [events, setEvents] = useState<GatewayEventFrame[]>([]);
  const clientRef = useRef<GatewayBrowserClient | null>(null);

  useEffect(() => {
    // Determine the WS URL from the current window location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // Vora gateway default path is /gateway
    const url = `${protocol}//${host}/gateway`;

    const client = new GatewayBrowserClient({
      url,
      clientName: 'control-ui' as unknown as any,
      onHello: (hello) => {
        setConnected(true);
        setHelloState(hello);
        setError(undefined);
      },
      onEvent: (evt) => {
        setEvents((prev) => [...prev, evt]);
      },
      onClose: (info) => {
        setConnected(false);
        setError(info.error);
      }
    });

    clientRef.current = client;
    client.start();

    return () => {
      client.stop();
    };
  }, []);

  const sendChat = async (message: string) => {
    if (!clientRef.current?.connected) throw new Error("Not connected to gateway");
    return clientRef.current.request("chat.send", {
      sessionKey: "main",
      message: message,
      deliver: false,
      idempotencyKey: Date.now().toString()
    });
  };

  const patchConfig = async (patch: any) => {
    if (!clientRef.current?.connected) throw new Error("Not connected to gateway");
    return clientRef.current.request("config.patch", patch);
  };

  const getConfig = async () => {
    if (!clientRef.current?.connected) throw new Error("Not connected to gateway");
    return clientRef.current.request("config.get", {});
  };

  return { connected, helloState, error, events, sendChat, patchConfig, getConfig, client: clientRef.current };
}
