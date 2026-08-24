import { WSFrame } from '../types/index';
import { ApiService } from './api';

type EventHandler<T = any> = (payload: T, frame: WSFrame<T>) => void;

class RealtimeSocketClient {
  private socket: WebSocket | null = null;
  private isConnected = false;
  private isAuthenticated = false;
  private reconnectTimer: any = null;
  private heartbeatInterval: any = null;
  private listeners = new Map<string, Set<EventHandler>>();
  private pendingQueue: WSFrame[] = [];
  private seq = 0;

  connect() {
    const token = ApiService.getToken();
    if (!token) {
      console.warn('Cannot connect WebSocket: No auth token');
      return;
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.isConnected = true;
        console.log('⚡ WebSocket Connected. Sending auth:handshake...');
        this.sendHandshake(token);
        this.startHeartbeat();
      };

      this.socket.onmessage = (event) => {
        try {
          const frame: WSFrame = JSON.parse(event.data);
          this.handleFrame(frame);
        } catch (err) {
          console.error('Failed to parse WS frame:', err);
        }
      };

      this.socket.onclose = (event) => {
        this.isConnected = false;
        this.isAuthenticated = false;
        this.stopHeartbeat();
        console.log(`WebSocket closed (code ${event.code}). Reconnecting in 2s...`);
        this.scheduleReconnect();
      };

      this.socket.onerror = (err) => {
        console.error('WebSocket Error:', err);
      };
    } catch (err) {
      console.error('Failed to construct WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  private sendHandshake(token: string) {
    this.send('auth:handshake', {
      token,
      device_id: `web_client_${navigator.userAgent.slice(0, 20)}`,
      device_type: 'web',
    });
  }

  private handleFrame(frame: WSFrame) {
    if (frame.type === 'auth:ack') {
      this.isAuthenticated = true;
      console.log('✅ WebSocket Authenticated successfully:', frame.payload.user.display_name);
      // Flush pending queue
      while (this.pendingQueue.length > 0) {
        const item = this.pendingQueue.shift();
        if (item) this.rawSend(item);
      }
    }

    const handlers = this.listeners.get(frame.type);
    if (handlers) {
      for (const handler of handlers) {
        handler(frame.payload, frame);
      }
    }
  }

  send(type: string, payload: any, correlationId?: string) {
    this.seq++;
    const frame: WSFrame = {
      seq: this.seq,
      type,
      payload,
      correlation_id: correlationId,
      timestamp: Date.now(),
    };

    if (this.isConnected && (type === 'auth:handshake' || this.isAuthenticated)) {
      this.rawSend(frame);
    } else {
      this.pendingQueue.push(frame);
    }
  }

  private rawSend(frame: WSFrame) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(frame));
    }
  }

  on<T = any>(type: string, handler: EventHandler<T>): () => void {
    let handlers = this.listeners.get(type);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(type, handlers);
    }
    handlers.add(handler);

    return () => {
      handlers?.delete(handler);
    };
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.isAuthenticated) {
        this.send('presence:heartbeat', { status: 'online' });
      }
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
    this.isAuthenticated = false;
  }

  getIsConnected(): boolean {
    return this.isConnected && this.isAuthenticated;
  }
}

export const wsClient = new RealtimeSocketClient();
