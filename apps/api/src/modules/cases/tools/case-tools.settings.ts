import { Injectable } from '@nestjs/common';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';

export interface CaseToolsConfig {
  invoiceDefaultDueDays: number;
  invoiceReminderDays: number[];
  invoiceOverdueEveryDays: number;
  invoiceMaxReminders: number;
  invoicePayLink: boolean;
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
      invoiceDefaultDueDays,
      invoiceReminderDays,
      invoiceOverdueEveryDays,
      invoiceMaxReminders,
      invoicePayLink,
      lateFeePercent,
      lateFeeGraceDays,
      signExpiryDays,
      signReminderEveryDays,
      signMaxReminders,
      signResendCooldownMinutes,
    ] = await Promise.all([
      s.number('case_tools.invoice_default_due_days'),
      s.numberList('case_tools.invoice_reminder_days'),
      s.number('case_tools.invoice_overdue_remind_every_days'),
      s.number('case_tools.invoice_max_reminders'),
      s.boolean('case_tools.invoice_pay_link'),
      s.number('case_tools.invoice_late_fee_percent'),
      s.number('case_tools.invoice_late_fee_grace_days'),
      s.number('case_tools.sign_expiry_days'),
      s.number('case_tools.sign_reminder_every_days'),
      s.number('case_tools.sign_max_reminders'),
      s.number('case_tools.sign_resend_cooldown_minutes'),
    ]);
    return {
      invoiceDefaultDueDays,
      invoiceReminderDays,
      invoiceOverdueEveryDays,
      invoiceMaxReminders,
      invoicePayLink,
      lateFeePercent,
      lateFeeGraceDays,
      signExpiryDays,
      signReminderEveryDays,
      signMaxReminders,
      signResendCooldownMinutes,
    };
  }
}
