import { WsFrame } from '../types';

type MessageHandler = (frame: WsFrame) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private seq: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected: boolean = false;
  private onConnectCallbacks: (() => void)[] = [];
  private onDisconnectCallbacks: ((error?: string) => void)[] = [];

  constructor(url: string) {
    this.url = url;
  }

  connect(token: string) {
    this.token = token;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.isConnected = true;
      // Send auth handshake (backend expects auth:handshake)
      this.send('auth:handshake', { token, device_type: 'mobile' });
      this.onConnectCallbacks.forEach((cb) => cb());
    };

    this.ws.onmessage = (event) => {
      try {
        const frame: WsFrame = JSON.parse(event.data);
        const handlers = this.handlers.get(frame.type) || [];
        handlers.forEach((h) => h(frame));

        // Also notify wildcard handlers
        const wildcardHandlers = this.handlers.get('*') || [];
        wildcardHandlers.forEach((h) => h(frame));
      } catch (e) {
        console.warn('Failed to parse WS frame:', e);
      }
    };

    this.ws.onclose = (event) => {
      this.isConnected = false;
      this.onDisconnectCallbacks.forEach((cb) => cb('closed: ' + event.code));
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      console.warn('WebSocket error');
      this.onDisconnectCallbacks.forEach((cb) => cb('error'));
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  send(type: string, payload: any = {}, correlation_id?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WS not open, cannot send:', type);
      return;
    }
    const frame: WsFrame = {
      seq: ++this.seq,
      type,
      payload,
      correlation_id,
      timestamp: new Date().toISOString(),
    };
    this.ws.send(JSON.stringify(frame));
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  onConnect(cb: () => void) {
    this.onConnectCallbacks.push(cb);
    return () => {
      this.onConnectCallbacks = this.onConnectCallbacks.filter((c) => c !== cb);
    };
  }

  onDisconnect(cb: (error?: string) => void) {
    this.onDisconnectCallbacks.push(cb);
    return () => {
      this.onDisconnectCallbacks = this.onDisconnectCallbacks.filter((c) => c !== cb);
    };
  }

  get connected(): boolean {
    return this.isConnected;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.token) {
        this.connect(this.token);
      }
    }, 3000);
  }
}

export default WebSocketService;
