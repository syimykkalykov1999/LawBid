/** What every channel gets for docs/01 §10.6's "вход с нового
 * устройства" alert. Contact details are resolved per channel (email:
 * the verified address; push: the user's FCM tokens, file 05). */
export interface NewDeviceLoginNotice {
  userId: string;
  /** Verified email, or undefined when the user has none. */
  verifiedEmail?: string;
  deviceId: string;
  deviceName?: string;
  platform?: string;
  at: Date;
}

/** Outcome, for the auth_events audit row: which channels actually
 * delivered, which were skipped and why. */
export type ChannelResult =
  | { channel: string; status: 'sent' }
  | { channel: string; status: 'skipped'; reason: string }
  | { channel: string; status: 'failed' };

/**
 * One delivery channel for security notices. Implementations must not
 * throw for "not applicable" cases (no verified email, no push token) —
 * they return `skipped`. NewDeviceNotifier fans a notice out to every
 * registered channel (LOGIN_NOTIFICATION_CHANNELS) independently.
 */
export interface LoginNotificationChannel {
  readonly name: string;
  notifyNewDevice(notice: NewDeviceLoginNotice): Promise<ChannelResult>;
}

export const LOGIN_NOTIFICATION_CHANNELS = Symbol(
  'LOGIN_NOTIFICATION_CHANNELS',
);
