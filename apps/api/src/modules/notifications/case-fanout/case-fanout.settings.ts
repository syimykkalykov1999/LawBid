import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { APP_SETTINGS } from '../../../common/app-settings/app-settings.defaults';

export type FraudAction = 'normal' | 'small' | 'none';

export interface FanoutSettings {
  enabled: boolean;
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
}

/** The built-in defaults (no admin changes): today's reach. */
export const DEFAULT_FANOUT_SETTINGS: FanoutSettings = {
  enabled: APP_SETTINGS['case_fanout.enabled'],
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
};

function action(raw: string, fallback: FraudAction): FraudAction {
  return raw === 'normal' || raw === 'small' || raw === 'none' ? raw : fallback;
}

/** Reads every `case_fanout.*` setting (AppConfig caches the table, so
 * this is one cache read). Without a settings service: the defaults. */
export async function loadFanoutSettings(
  settings?: AppSettingsService,
): Promise<FanoutSettings> {
  if (!settings) return DEFAULT_FANOUT_SETTINGS;
  const n = async (k: keyof typeof APP_SETTINGS): Promise<number> =>
    Math.max(0, await settings.number(k));
  return {
    enabled: await settings.boolean('case_fanout.enabled'),
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
  };
}
