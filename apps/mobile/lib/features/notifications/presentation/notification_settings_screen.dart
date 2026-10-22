// ignore_for_file: lines_longer_than_80_chars
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/pickers/app_pickers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/notifications/application/notification_sounds.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/application/system_notifications.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/notifications/presentation/new_case_alerts_section.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// docs/05 §9.5 Settings → Notifications: a switch per kind of
/// notification grouped in blocks (owner 2026-10-21, inbox 30; only the
/// serious system notices locked), the app icon counter (inbox 29), sounds,
/// quiet hours in the device's time zone. The bell and Profile → Settings
/// open this same screen over one state (inbox 29b).
class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  ConsumerState<NotificationSettingsScreen> createState() =>
      _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState
    extends ConsumerState<NotificationSettingsScreen> {
  bool _saving = false;

  /// Owner 2026-10-21 (inbox 30): the blocks, in screen order.
  static const _blocks = [
    'chats',
    'feed',
    'bids',
    'cases',
    'assistants',
    'system',
  ];

  @override
  void initState() {
    super.initState();
    // Owner 2026-10-21 (29b): the bell and Profile → Settings open this
    // one screen over one state; re-read it quietly on every open.
    Future.microtask(() {
      if (mounted) {
        unawaited(ref.read(notificationSettingsProvider.notifier).reload());
      }
    });
  }

  Future<void> _run(
    Future<void> Function(NotificationSettingsNotifier n) call,
  ) async {
    final t = ref.read(translatorProvider);
    setState(() => _saving = true);
    try {
      await call(ref.read(notificationSettingsProvider.notifier));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _toggleTopic(TopicSetting x, bool v) {
    // Owner 2026-10-01: turning "New cases" on says what comes and that it
    // can be changed (the qualifications appear right under the switch).
    if (x.key == 'newCases' && !x.push && v) {
      showAppSnackBar(
        context,
        ref.read(translatorProvider).t('notif.newCases.turnedOn'),
      );
    }
    _run((n) => n.setTopic(x, push: v));
  }

  Future<void> _setQuiet(QuietHours? q) => _run((n) => n.setQuietHours(q));

  Future<void> _pickTime(NotificationSettings s, {required bool start}) async {
    final q = s.quietHours ??
        const QuietHours(start: '22:00', end: '07:00', timezone: 'UTC');
    final parts = (start ? q.start : q.end).split(':');
    final picked = await showAppTimePicker(
      context: context,
      initialTime: TimeOfDay(
        hour: int.parse(parts[0]),
        minute: int.parse(parts[1]),
      ),
    );
    if (picked == null || !mounted) return;
    final hhmm =
        '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    await _setQuiet(
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

  static String _blockTitle(Translator t, String block) => switch (block) {
        'chats' => t.t('notif.block.chats'),
        'feed' => t.t('notif.category.social'),
        'bids' => t.t('notif.category.bids'),
        'cases' => t.t('notif.category.cases'),
        'assistants' => t.t('notif.block.assistants'),
        _ => t.t('notif.category.system'),
      };

  /// Reuses the old category names where the switch is the same thing.
  static String _topicLabel(Translator t, String key) => switch (key) {
        'messages' ||
        'groups' ||
        'channels' ||
        'calls' ||
        'newCases' =>
          t.t('notif.category.$key'),
        'assistantCases' => t.t('notif.category.cases'),
        'assistantBids' => t.t('notif.category.bids'),
        'assistantTasks' => t.t('notif.topic.tasks'),
        _ => t.t('notif.topic.$key'),
      };

  static String? _topicHint(Translator t, String key) => switch (key) {
        'following' => t.t('notif.category.following.hint'),
        'newCases' => t.t('notif.category.newCases.hint'),
        'security' => t.t('notif.settings.locked'),
        _ => null,
      };

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final remote = ref.watch(notificationSettingsProvider);
    final attorney = ref.watch(currentUserRoleProvider) == UserRole.attorney;
    // An assistant's own settings have no «From assistants» block.
    final team = attorney && !ref.watch(isAssistantProvider);
    final emailFlows = ref.watch(emailFlowsEnabledProvider);

    // A Material card, so the switch rows' ink shows on it.
    Widget card({
      required EdgeInsetsGeometry padding,
      required Widget child,
      Key? key,
      double bottom = 0,
    }) =>
        Padding(
          key: key,
          padding: EdgeInsets.only(bottom: bottom),
          child: Material(
            color: colors.surface,
            clipBehavior: Clip.antiAlias,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadii.card),
              side: BorderSide(color: colors.border),
            ),
            child: Padding(padding: padding, child: child),
          ),
        );
    final caption = type.caption.copyWith(color: colors.textSecondary);

    Widget topicRow(NotificationSettings s, TopicSetting x) {
      final parent = x.parent == null
          ? null
          : s.topics.where((p) => p.key == x.parent).firstOrNull;
      final parentOff = parent != null && !parent.push;
      final hint = _topicHint(t, x.key);
      return Padding(
        padding: EdgeInsetsDirectional.only(
          start: parent != null ? AppSpacing.md : 0,
        ),
        child: SwitchListTile.adaptive(
          key: ValueKey('notif-topic-${x.key}'),
          contentPadding: EdgeInsets.zero,
          title: Text(
            x.key == 'assistants'
                ? t.t('notif.topic.assistants')
                : _topicLabel(t, x.key),
          ),
          subtitle: hint == null ? null : Text(hint, style: caption),
          secondary: x.locked
              ? AppIcon(
                  AppIcons.lockOutlineRounded,
                  size: AppSizes.iconSm,
                  color: colors.textSecondary,
                )
              : null,
          value: x.locked || x.push,
          activeTrackColor: colors.gold,
          onChanged: x.locked || parentOff ? null : (v) => _toggleTopic(x, v),
        ),
      );
    }

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
        builder: (s) {
          final q = s.quietHours;
          final system = s.categories
              .where((c) => c.category == NotifCategory.system)
              .firstOrNull;
          bool shown(TopicSetting x) =>
              !x.attorneyOnly || (x.block == 'assistants' ? team : attorney);
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
                const _SystemSwitchCard(),
                const SizedBox(height: AppSpacing.sm),
                // Owner 2026-10-21 (inbox 29): the number on the app icon.
                card(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                    vertical: AppSpacing.xs,
                  ),
                  child: SwitchListTile.adaptive(
                    key: const ValueKey('notif-icon-badge'),
                    contentPadding: EdgeInsets.zero,
                    title: Text(t.t('notif.iconBadge')),
                    subtitle: Text(t.t('notif.iconBadge.hint'), style: caption),
                    value: s.iconBadge,
                    activeTrackColor: colors.gold,
                    onChanged: (v) => _run((n) => n.setIconBadge(enabled: v)),
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                Text(
                  t.t('notif.settings.categories'),
                  style: type.titleMedium.copyWith(color: colors.text),
                ),
                // Owner 2026-10-02: what "off" means.
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.xs),
                  child: Text(t.t('notif.settings.offHint'), style: caption),
                ),
                const SizedBox(height: AppSpacing.sm),
                // Owner 2026-10-21 (inbox 30): a switch per kind, grouped.
                for (final block in _blocks)
                  if (s.topics.any((x) => x.block == block && shown(x)))
                    card(
                      key: ValueKey('notif-block-$block'),
                      bottom: AppSpacing.sm,
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.md,
                        vertical: AppSpacing.sm,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _blockTitle(t, block),
                            style: type.body.copyWith(
                              color: colors.text,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          for (final x in s.topics)
                            if (x.block == block && shown(x)) ...[
                              topicRow(s, x),
                              // Owner 2026-10-01: which qualifications send
                              // new cases (profile's by default).
                              if (x.key == 'newCases' && x.push)
                                const NewCaseAlertsSection(),
                            ],
                          // Audit 2026-10-02: only system notices are ever
                          // emailed. Owner 2026-10-07: none at all while
                          // admin «Вход и письма по почте» is off.
                          if (block == 'system' && emailFlows && system != null)
                            SwitchListTile.adaptive(
                              contentPadding: EdgeInsets.zero,
                              title: Text(t.t('notif.settings.email')),
                              value: system.email,
                              activeTrackColor: colors.gold,
                              onChanged: null,
                            ),
                        ],
                      ),
                    ),
                const SizedBox(height: AppSpacing.lg),
                Text(
                  t.t('notif.sounds.title'),
                  style: type.titleMedium.copyWith(color: colors.text),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(t.t('notif.sounds.hint'), style: caption),
                for (final c in NotificationSoundChannel.values)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(t.t('notif.sounds.${c.name}')),
                    subtitle: Text(t.t('notif.sounds.default'), style: caption),
                    trailing: AppIcon(
                      AppIcons.chevronRightRounded,
                      color: colors.textSecondary,
                    ),
                    onTap: () => openNotificationSoundSettings(
                      c,
                      iconBadge: s.iconBadge,
                    ),
                  ),
                const SizedBox(height: AppSpacing.lg),
                Text(
                  t.t('notif.settings.quiet'),
                  style: type.titleMedium.copyWith(color: colors.text),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(t.t('notif.settings.quietHint'), style: caption),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: Text(t.t('notif.settings.quietOn')),
                  value: q != null,
                  activeTrackColor: colors.gold,
                  onChanged: (on) async => _setQuiet(
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
                          leading: const AppIcon(
                            AppIcons.nightlightRound,
                            size: AppSpacing.lg,
                          ),
                          onTap: () => _pickTime(s, start: true),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: AppChip(
                          label: '${t.t('notif.settings.to')} ${q.end}',
                          leading: const AppIcon(
                            AppIcons.wbSunnyOutlined,
                            size: AppSpacing.lg,
                          ),
                          onTap: () => _pickTime(s, start: false),
                        ),
                      ),
                    ],
                  ),
                if (q != null)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.sm),
                    child: Text(q.timezone, style: caption),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// Owner 2026-10-15: what the phone itself says about this app's
/// notifications. Off → a plain explanation and a button to the phone's
/// settings; on or off, «Try it» posts a local notification through the
/// app's channel (the sound is the channel's).
class _SystemSwitchCard extends ConsumerStatefulWidget {
  const _SystemSwitchCard();

  @override
  ConsumerState<_SystemSwitchCard> createState() => _SystemSwitchCardState();
}

class _SystemSwitchCardState extends ConsumerState<_SystemSwitchCard>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Back from the phone's settings: read the switch again.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(systemNotificationsEnabledProvider);
    }
  }

  Future<void> _try() async {
    final t = ref.read(translatorProvider);
    final sys = ref.read(systemNotificationsProvider);
    var ok = await sys.enabled();
    if (!ok) ok = await sys.request();
    if (ok) {
      await sys.showTest(
        t.t('notif.system.test.title'),
        t.t('notif.system.test.body'),
      );
    }
    ref.invalidate(systemNotificationsEnabledProvider);
    if (!ok && mounted) await sys.openSettings();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final on = ref.watch(systemNotificationsEnabledProvider).value ?? true;
    final danger = readableOn(colors.danger, colors.surface);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: on ? colors.border : danger),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              AppIcon(
                on
                    ? AppIcons.notificationsNoneRounded
                    : AppIcons.notificationsOffOutlined,
                color: on ? colors.text : danger,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  t.t(on ? 'notif.system.on' : 'notif.system.off'),
                  style: type.body.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          if (!on) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('notif.system.offBody'),
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          if (!on) ...[
            AppButton(
              key: const ValueKey('notif-system-open'),
              label: t.t('notif.system.open'),
              height: AppSizes.touchTarget,
              onPressed: () =>
                  ref.read(systemNotificationsProvider).openSettings(),
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          AppButton(
            key: const ValueKey('notif-system-test'),
            label: t.t('notif.system.test'),
            variant: AppButtonVariant.secondary,
            height: AppSizes.touchTarget,
            onPressed: _try,
          ),
        ],
      ),
    );
  }
}
