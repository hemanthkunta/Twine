export type DisappearingTimer = 0 | 30 | 300 | 3600 | 86400 | 604800; // 0 = off, seconds

export interface DisappearingConfig {
  chatId: string;
  durationSeconds: DisappearingTimer;
}

class DisappearingMessageService {
  private chatTimers: Map<string, DisappearingTimer> = new Map();
  private messageExpiryTimers: Map<string, number> = new Map(); // msgId -> expiration timestamp

  setChatTimer(chatId: string, durationSeconds: DisappearingTimer) {
    this.chatTimers.set(chatId, durationSeconds);
    localStorage.setItem(`disappearing_timer_${chatId}`, durationSeconds.toString());
  }

  getChatTimer(chatId: string): DisappearingTimer {
    if (this.chatTimers.has(chatId)) {
      return this.chatTimers.get(chatId)!;
    }
    const saved = localStorage.getItem(`disappearing_timer_${chatId}`);
    const val = saved ? (parseInt(saved, 10) as DisappearingTimer) : 0;
    this.chatTimers.set(chatId, val);
    return val;
  }

  formatTimerLabel(seconds: DisappearingTimer): string {
    if (seconds === 0) return 'Off';
    if (seconds === 30) return '30 Seconds';
    if (seconds === 300) return '5 Minutes';
    if (seconds === 3600) return '1 Hour';
    if (seconds === 86400) return '24 Hours';
    if (seconds === 604800) return '1 Week';
    return `${seconds}s`;
  }
}

export const disappearingService = new DisappearingMessageService();
