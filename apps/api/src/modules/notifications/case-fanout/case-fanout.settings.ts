import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../../common/app-settings/app-settings.defaults';
import {
  parseSwitchMode,
  readSwitchMode,
  type SwitchMode,
} from '../../../common/app-settings/switch-mode';

export type FraudAction = 'normal' | 'small' | 'none';

export interface FanoutSettings {
  /** `case_fanout.enabled` as the owner set it: off | on | auto. */
  mode: SwitchMode;
  /** Waves on for this run: `on`, or `auto` with a healthy queue
   * (the `wavesAuto` signal passed by the caller; false when none). */
  enabled: boolean;
  /** Авто: waiting wave jobs above this = the queue is behind. */
  autoMaxWaiting: number;
  firstWaveSize: number;
  waveSize: number;
  waveIntervalMinutes: number;
  maxWaves: number;
  /** 0 = never stop on offers. */
  stopAtBids: number;
  newQuotaPercent: number;
  newMaxAlerts: number;
  newMaxBids: number;
  /** 0 = no cap. */
  dailyCap: number;
  fraudReviewAction: FraudAction;
  fraudRestrictedAction: FraudAction;
  fraudSmallWaveSize: number;
  fraudDelayMinutes: number;
  /** Algo audit 2026-10-27 (H-1): with the waves off, `auto` still runs the
   * one legacy wave as a queue job (retries) when Redis is there. */
  queueMode: 'auto' | 'off';
  /** Algo audit 2026-10-27 (H-2): an urgent case reaches the whole
   * audience in one wave. */
  urgentFast: boolean;
  /** Algo audit 2026-10-27 (CASES M-4): the fraud gate with the waves off. */
  legacyFraudGate: boolean;
}

/** The built-in defaults (no admin changes): today's reach. */
export const DEFAULT_FANOUT_SETTINGS: FanoutSettings = {
  mode: parseSwitchMode(APP_SETTINGS['case_fanout.enabled']),
  enabled: false,
  autoMaxWaiting: APP_SETTINGS['case_fanout.auto_max_waiting'],
  firstWaveSize: APP_SETTINGS['case_fanout.first_wave_size'],
  waveSize: APP_SETTINGS['case_fanout.wave_size'],
  waveIntervalMinutes: APP_SETTINGS['case_fanout.wave_interval_minutes'],
  maxWaves: APP_SETTINGS['case_fanout.max_waves'],
  stopAtBids: APP_SETTINGS['case_fanout.stop_at_bids'],
  newQuotaPercent: APP_SETTINGS['case_fanout.new_quota_percent'],
  newMaxAlerts: APP_SETTINGS['case_fanout.new_max_alerts'],
  newMaxBids: APP_SETTINGS['case_fanout.new_max_bids'],
  dailyCap: APP_SETTINGS['case_fanout.daily_cap'],
  fraudReviewAction: 'normal',
  fraudRestrictedAction: 'none',
  fraudSmallWaveSize: APP_SETTINGS['case_fanout.fraud_small_wave_size'],
  fraudDelayMinutes: APP_SETTINGS['case_fanout.fraud_delay_minutes'],
  queueMode: APP_SETTINGS['case_fanout.queue_mode'] as 'auto' | 'off',
  urgentFast: APP_SETTINGS['case_alerts.urgent_fast_enabled'],
  legacyFraudGate: APP_SETTINGS['case_fanout.legacy_fraud_gate_enabled'],
};

function action(raw: string, fallback: FraudAction): FraudAction {
  return raw === 'normal' || raw === 'small' || raw === 'none' ? raw : fallback;
}

/** `enabled` for a run from the owner's mode and the auto signal. */
export function wavesOn(mode: SwitchMode, wavesAuto: boolean): boolean {
  return mode === 'on' || (mode === 'auto' && wavesAuto);
}

/** Reads every `case_fanout.*` setting (AppConfig caches the table, so
 * this is one cache read). Without a settings service: the defaults.
 * [wavesAuto] is the Авто signal (the fan-out queue is reachable and not
 * behind); without it `auto` behaves as off for this run. */
export async function loadFanoutSettings(
  settings?: AppSettingsService,
  wavesAuto = false,
): Promise<FanoutSettings> {
  if (!settings) {
    return {
      ...DEFAULT_FANOUT_SETTINGS,
      enabled: wavesOn(DEFAULT_FANOUT_SETTINGS.mode, wavesAuto),
    };
  }
  const n = async (k: keyof typeof APP_SETTINGS): Promise<number> =>
    Math.max(0, await settings.number(k));
  const mode = await readSwitchMode(settings, 'case_fanout.enabled');
  return {
    mode,
    enabled: wavesOn(mode, wavesAuto),
    autoMaxWaiting: await n('case_fanout.auto_max_waiting'),
    firstWaveSize: Math.max(1, await n('case_fanout.first_wave_size')),
    waveSize: Math.max(1, await n('case_fanout.wave_size')),
    waveIntervalMinutes: Math.max(
      1,
      await n('case_fanout.wave_interval_minutes'),
    ),
    maxWaves: Math.max(1, await n('case_fanout.max_waves')),
    stopAtBids: await n('case_fanout.stop_at_bids'),
    newQuotaPercent: Math.min(100, await n('case_fanout.new_quota_percent')),
    newMaxAlerts: await n('case_fanout.new_max_alerts'),
    newMaxBids: await n('case_fanout.new_max_bids'),
    dailyCap: await n('case_fanout.daily_cap'),
    fraudReviewAction: action(
      await settings.string('case_fanout.fraud_review_action'),
      'normal',
    ),
    fraudRestrictedAction: action(
      await settings.string('case_fanout.fraud_restricted_action'),
      'none',
    ),
    fraudSmallWaveSize: Math.max(
      1,
      await n('case_fanout.fraud_small_wave_size'),
    ),
    fraudDelayMinutes: await n('case_fanout.fraud_delay_minutes'),
    queueMode:
      (await settings.string('case_fanout.queue_mode')) === 'off'
        ? 'off'
        : 'auto',
    urgentFast: await settings.boolean('case_alerts.urgent_fast_enabled'),
    legacyFraudGate: await settings.boolean(
      'case_fanout.legacy_fraud_gate_enabled',
    ),
  };
}
