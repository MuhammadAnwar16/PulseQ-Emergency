import { Injectable, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ErRealtimeMessage {
  type?: string;
  data?: any;
  [key: string]: any;
}

export interface UnwrappedErEvent {
  eventType: string;
  payload: any;
  data: any;
  raw: ErRealtimeMessage;
}

export type WsConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

/**
 * MANDATORY SINGLE SHARED ENVELOPE-UNWRAPPING UTILITY.
 * All feature components listening to WebSocket events MUST use this exact function.
 */
export function unwrapErRealtimeEvent(msg: ErRealtimeMessage | null | undefined): UnwrappedErEvent | null {
  if (!msg) return null;

  let payload: any = null;
  let eventType = '';

  // Case 1: Double-wrapped notification envelope: { type: "notification", data: { type: "er_...", data: {...} } }
  if (msg.type === 'notification' && msg.data && typeof msg.data === 'object' && msg.data.type) {
    eventType = msg.data.type;
    payload = msg.data.data !== undefined ? msg.data.data : msg.data;
  }
  // Case 2: Standard single-wrapped envelope: { type: "er_patient_created", data: {...} }
  else if (msg.type && msg.type !== 'notification') {
    eventType = msg.type;
    payload = msg.data !== undefined ? msg.data : msg;
  }
  // Case 3: Legacy event field fallback
  else if (msg['event']) {
    eventType = msg['event'];
    payload = msg.data !== undefined ? msg.data : msg;
  }
  else {
    return null;
  }

  return {
    eventType,
    payload,
    data: payload,
    raw: msg
  };
}

interface RoomConnection {
  subject: Subject<ErRealtimeMessage>;
  socket: WebSocket | null;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  manualClose: boolean;
  subscriberCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class EmergencyRealtimeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly connections = new Map<string, RoomConnection>();
  private readonly maxReconnectDelayMs = 30000;

  readonly connectionStatus = signal<WsConnectionStatus>('disconnected');

  connect(room: string): Observable<ErRealtimeMessage> {
    return new Observable<ErRealtimeMessage>(observer => {
      if (!this.isBrowser()) {
        observer.complete();
        return;
      }

      const state = this.ensureRoomState(room);
      state.subscriberCount += 1;

      this.openSocket(room);

      const subscription = state.subject.subscribe(observer);

      return () => {
        subscription.unsubscribe();
        const currentState = this.connections.get(room);
        if (!currentState) {
          return;
        }

        currentState.subscriberCount = Math.max(0, currentState.subscriberCount - 1);
        if (currentState.subscriberCount === 0) {
          this.disconnect(room);
        }
      };
    });
  }

  disconnect(room: string): void {
    const state = this.connections.get(room);
    if (!state) {
      return;
    }

    state.manualClose = true;

    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }

    try {
      state.socket?.close();
    } catch {
      // Ignore close errors.
    }

    state.socket = null;
    this.connections.delete(room);

    if (this.connections.size === 0) {
      this.connectionStatus.set('disconnected');
    }
  }

  private ensureRoomState(room: string): RoomConnection {
    let state = this.connections.get(room);
    if (!state) {
      state = {
        subject: new Subject<ErRealtimeMessage>(),
        socket: null,
        reconnectAttempts: 0,
        reconnectTimer: null,
        manualClose: false,
        subscriberCount: 0
      };
      this.connections.set(room, state);
    }

    state.manualClose = false;
    return state;
  }

  private openSocket(room: string): void {
    const state = this.connections.get(room);
    if (!state || state.socket?.readyState === WebSocket.OPEN || state.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const wsUrl = `${environment.wsBaseUrl}?room=${encodeURIComponent(room)}`;

    const socket = new WebSocket(wsUrl);
    state.socket = socket;

    socket.onopen = () => {
      state.reconnectAttempts = 0;
      this.connectionStatus.set('connected');
    };

    socket.onmessage = (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : '';
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw) as ErRealtimeMessage;
        state.subject.next(parsed);
      } catch {
        state.subject.next({ type: 'raw', data: raw });
      }
    };

    socket.onerror = () => {
      this.connectionStatus.set('reconnecting');
    };

    socket.onclose = () => {
      state.socket = null;
      if (state.manualClose || state.subscriberCount === 0) {
        this.connectionStatus.set('disconnected');
        return;
      }
      this.connectionStatus.set('reconnecting');
      this.scheduleReconnect(room);
    };
  }

  private scheduleReconnect(room: string): void {
    const state = this.connections.get(room);
    if (!state || state.manualClose || state.subscriberCount === 0) {
      return;
    }

    if (state.reconnectTimer) {
      return;
    }

    state.reconnectAttempts += 1;
    const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts - 1), this.maxReconnectDelayMs);

    state.reconnectTimer = setTimeout(() => {
      const currentState = this.connections.get(room);
      if (!currentState || currentState.manualClose || currentState.subscriberCount === 0) {
        return;
      }

      currentState.reconnectTimer = null;
      this.openSocket(room);
    }, delay);
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }
}
