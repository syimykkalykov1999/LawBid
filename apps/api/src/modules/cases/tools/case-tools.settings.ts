import { Injectable } from '@nestjs/common';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';

export type RemindersMode = 'off' | 'on' | 'auto';

export interface CaseToolsConfig {
  remindersMode: RemindersMode;
  remindersDailyCap: number;
  invoiceDefaultDueDays: number;
  invoiceReminderDays: number[];
  invoiceOverdueEveryDays: number;
  invoiceMaxReminders: number;
  lateFeePercent: number;
  lateFeeGraceDays: number;
  signExpiryDays: number;
  signReminderEveryDays: number;
  signMaxReminders: number;
  signResendCooldownMinutes: number;
}

/**
 * Owner 2026-10-25: the admin-tunable knobs of the case tools (Config →
 * `case_tools.*`). Everything is off or neutral by default.
 */
@Injectable()
export class CaseToolsSettings {
  constructor(private readonly settings: AppSettingsService) {}

  async get(): Promise<CaseToolsConfig> {
    const s = this.settings;
    const [
      remindersModeRaw,
      remindersDailyCap,
      invoiceDefaultDueDays,
      invoiceReminderDays,
      invoiceOverdueEveryDays,
      invoiceMaxReminders,
      lateFeePercent,
      lateFeeGraceDays,
      signExpiryDays,
      signReminderEveryDays,
      signMaxReminders,
      signResendCooldownMinutes,
    ] = await Promise.all([
      s.string('case_tools.reminders.mode'),
      s.number('case_tools.reminders.daily_cap'),
      s.number('case_tools.invoice_default_due_days'),
      s.numberList('case_tools.invoice_reminder_days'),
      s.number('case_tools.invoice_overdue_remind_every_days'),
      s.number('case_tools.invoice_max_reminders'),
      s.number('case_tools.invoice_late_fee_percent'),
      s.number('case_tools.invoice_late_fee_grace_days'),
      s.number('case_tools.sign_expiry_days'),
      s.number('case_tools.sign_reminder_every_days'),
      s.number('case_tools.sign_max_reminders'),
      s.number('case_tools.sign_resend_cooldown_minutes'),
    ]);
    const remindersMode: RemindersMode =
      remindersModeRaw === 'off' || remindersModeRaw === 'on'
        ? remindersModeRaw
        : 'auto';
    return {
      remindersMode,
      remindersDailyCap,
      invoiceDefaultDueDays,
      invoiceReminderDays,
      invoiceOverdueEveryDays,
      invoiceMaxReminders,
      lateFeePercent,
      lateFeeGraceDays,
      signExpiryDays,
      signReminderEveryDays,
      signMaxReminders,
      signResendCooldownMinutes,
    };
  }
}
