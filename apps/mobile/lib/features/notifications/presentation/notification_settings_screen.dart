import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/notifications/presentation/new_case_alerts_section.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:flutter_timezone/flutter_timezone.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';

/// docs/05 §9.5 Settings → Notifications: push and email per category
/// (`system` locked on), quiet hours in the device's time zone.
class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  ConsumerState<NotificationSettingsScreen> createState() =>
      _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState
    extends ConsumerState<NotificationSettingsScreen> {
  NotificationSettings? _local;
  bool _saving = false;

  Future<void> _apply(Future<NotificationSettings> Function() call,
      NotificationSettings optimistic) async {
    final t = ref.read(translatorProvider);
    final before = _local;
    setState(() {
      _local = optimistic;
      _saving = true;
    });
    try {
      final saved = await call();
      if (mounted) setState(() => _local = saved);
      // Owner 2026-10-02: chimes, ringing and badges follow at once.
      ref.invalidate(mutedCategoriesProvider);
      unawaited(ref.read(badgesProvider.notifier).refresh());
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _local = before);
      showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _toggle(NotificationSettings s, CategorySetting c,
      {bool? push, bool? email}) {
    final next = c.copyWith(push: push, email: email);
    final repo = ref.read(notificationsRepositoryProvider);
    // Owner 2026-10-01: turning "New cases" on says what comes and that it
    // can be changed (the qualifications appear right under the switch).
    if (c.category == NotifCategory.newCases &&
        !c.push &&
        !c.email &&
        (next.push || next.email)) {
      showAppSnackBar(
          context, ref.read(translatorProvider).t('notif.newCases.turnedOn'));
    }
    _apply(
      () => repo.updateSettings([next]),
      NotificationSettings(
        categories: [
          for (final x in s.categories) x.category == c.category ? next : x,
        ],
        quietHours: s.quietHours,
      ),
    );
  }

  Future<void> _setQuiet(NotificationSettings s, QuietHours? q) async {
    final repo = ref.read(notificationsRepositoryProvider);
    await _apply(() => repo.setQuietHours(q),
        NotificationSettings(categories: s.categories, quietHours: q));
  }

  Future<void> _pickTime(NotificationSettings s, {required bool start}) async {
    final q = s.quietHours ??
        const QuietHours(start: '22:00', end: '07:00', timezone: 'UTC');
    final parts = (start ? q.start : q.end).split(':');
    final picked = await showTimePicker(
      context: context,
      initialTime:
          TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1])),
    );
    if (picked == null || !mounted) return;
    final hhmm =
        '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    await _setQuiet(
      s,
      QuietHours(
        start: start ? hhmm : q.start,
        end: start ? q.end : hhmm,
        timezone: await _timeZone(),
      ),
    );
  }

  static Future<String> _timeZone() async {
    try {
      return (await FlutterTimezone.getLocalTimezone()).identifier;
    } on Object {
      return 'UTC';
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final remote = ref.watch(notificationSettingsProvider);
    final attorney = ref.watch(currentUserRoleProvider) == UserRole.attorney;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('settings.notifications')),
      ),
      body: AsyncDetailBody<NotificationSettings>(
        value: remote,
        t: t,
        onRetry: () => ref.invalidate(notificationSettingsProvider),
        builder: (server) {
          final s = _local ?? server;
          final q = s.quietHours;
          return AbsorbPointer(
            absorbing: _saving,
            child: ListView(
              // Bottom: the system gesture bar inset, so the last toggle
              // (quiet hours) is never under it (owner 2026-09-29).
              padding: EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                AppSpacing.screenSide,
                AppSpacing.screenSide,
                AppSpacing.screenSide + MediaQuery.paddingOf(context).bottom,
              ),
              children: [
                Text(t.t('notif.settings.categories'),
                    style: type.titleMedium.copyWith(color: colors.text)),
                // Owner 2026-10-02: what "off" means.
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.xs),
                  child: Text(
                    t.t('notif.settings.offHint'),
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                for (final c in s.categories)
                  if (c.category != NotifCategory.marketing &&
                      // New-case alerts are for attorneys.
                      (c.category != NotifCategory.newCases || attorney))
                    Container(
                      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                      padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.md, vertical: AppSpacing.sm),
                      decoration: BoxDecoration(
                        color: colors.surface,
                        borderRadius: BorderRadius.circular(AppRadii.card),
                        border: Border.all(color: colors.border),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  t.t('notif.category.${c.category.name}'),
                                  style: type.body.copyWith(
                                      color: colors.text,
                                      fontWeight: FontWeight.w600),
                                ),
                              ),
                              if (c.locked)
                                AppIcon(AppIcons.lockOutlineRounded,
                                    size: AppSizes.iconSm,
                                    color: colors.textSecondary),
                            ],
                          ),
                          if (c.locked)
                            Text(t.t('notif.settings.locked'),
                                style: type.caption
                                    .copyWith(color: colors.textSecondary)),
                          // Owner 2026-09-30: what the opt-in alerts are.
                          if (c.category == NotifCategory.following ||
                              c.category == NotifCategory.newCases)
                            Text(
                                t.t('notif.category.${c.category.name}.hint'),
                                style: type.caption
                                    .copyWith(color: colors.textSecondary)),
                          SwitchListTile.adaptive(
                            contentPadding: EdgeInsets.zero,
                            title: Text(t.t('notif.settings.push')),
                            value: c.push,
                            activeTrackColor: colors.gold,
                            onChanged:
                                c.locked ? null : (v) => _toggle(s, c, push: v),
                          ),
                          SwitchListTile.adaptive(
                            contentPadding: EdgeInsets.zero,
                            title: Text(t.t('notif.settings.email')),
                            value: c.email,
                            activeTrackColor: colors.gold,
                            onChanged: c.locked
                                ? null
                                : (v) => _toggle(s, c, email: v),
                          ),
                          // Owner 2026-10-01: which qualifications send
                          // new cases (profile's by default).
                          if (c.category == NotifCategory.newCases &&
                              (c.push || c.email))
                            const NewCaseAlertsSection(),
                        ],
                      ),
                    ),
                const SizedBox(height: AppSpacing.lg),
                Text(t.t('notif.settings.quiet'),
                    style: type.titleMedium.copyWith(color: colors.text)),
                const SizedBox(height: AppSpacing.xs),
                Text(t.t('notif.settings.quietHint'),
                    style: type.caption.copyWith(color: colors.textSecondary)),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: Text(t.t('notif.settings.quietOn')),
                  value: q != null,
                  activeTrackColor: colors.gold,
                  onChanged: (on) async => _setQuiet(
                    s,
                    on
                        ? QuietHours(
                            start: '22:00',
                            end: '07:00',
                            timezone: await _timeZone(),
                          )
                        : null,
                  ),
                ),
                if (q != null)
                  Row(
                    children: [
                      Expanded(
                        child: AppChip(
                          label: '${t.t('notif.settings.from')} ${q.start}',
                          leading: const AppIcon(AppIcons.nightlightRound,
                              size: AppSpacing.lg),
                          onTap: () => _pickTime(s, start: true),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: AppChip(
                          label: '${t.t('notif.settings.to')} ${q.end}',
                          leading: const AppIcon(AppIcons.wbSunnyOutlined,
                              size: AppSpacing.lg),
                          onTap: () => _pickTime(s, start: false),
                        ),
                      ),
                    ],
                  ),
                if (q != null)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.sm),
                    child: Text(q.timezone,
                        style:
                            type.caption.copyWith(color: colors.textSecondary)),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}
