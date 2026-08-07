import { Injectable, signal } from '@angular/core';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'alert' | 'code_blue';
  title: string;
  message: string;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  readonly toasts = signal<ToastMessage[]>([]);

  show(title: string, message: string, type: 'info' | 'success' | 'warning' | 'alert' | 'code_blue' = 'info', durationMs: number = 5000): void {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastMessage = {
      id,
      type,
      title,
      message,
      timestamp: new Date()
    };

    this.toasts.update(current => [newToast, ...current.slice(0, 4)]);

    if (durationMs > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, durationMs);
    }
  }

  success(title: string, message: string): void {
    this.show(title, message, 'success', 4000);
  }

  info(title: string, message: string): void {
    this.show(title, message, 'info', 4000);
  }

  warning(title: string, message: string): void {
    this.show(title, message, 'warning', 5000);
  }

  alert(title: string, message: string): void {
    this.show(title, message, 'alert', 7000);
  }

  dismiss(id: string): void {
    this.toasts.update(current => current.filter(t => t.id !== id));
  }
}
