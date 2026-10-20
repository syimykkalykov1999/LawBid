import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/features/notifications/application/system_notifications.dart';
import 'package:lawbid/features/notifications/application/task_reminder_scheduler.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Owner 2026-10-20: keeps the phone's reminder alarms equal to the planner
/// (see task_reminder_scheduler.dart for what they are and why).

final taskReminderSchedulerProvider = Provider<TaskReminderScheduler>(
  (ref) => TaskReminderScheduler(PluginNotificationsGateway()),
);

/// A tapped reminder opens the planner.
void _openFromPayload(Ref ref, String? payload) {
  if (payload == null) return;
  try {
    final j = jsonDecode(payload);
    if (j is! Map || j['type'] != taskReminderType) return;
    final route = notificationRoute(
      type: taskReminderType,
      payload: Map<String, Object?>.from(j),
      attorney: ref.read(currentUserRoleProvider) == UserRole.attorney,
      myId: ref.read(currentUserIdProvider),
    );
    if (route != null) unawaited(ref.read(appRouterProvider).push(route));
  } on Object catch (e) {
    debugPrint('reminder tap ignored: $e');
  }
}

/// Keeps the phone's alarms equal to the planner: listens to the active
/// task list (every create / edit / done / delete / move refreshes it) and
/// to the interface language, and re-arms. Watched for the whole signed-in
/// session by `sessionServicesProvider`; a no-op off Android.
final taskReminderSyncProvider = Provider<void>((ref) {
  if (!TaskReminderScheduler.supported) return;
  if (ref.watch(currentUserIdProvider) == null) return;
  final scheduler = ref.read(taskReminderSchedulerProvider);
  var ready = false;
  Future<void> ensureReady() async {
    if (ready) return;
    await scheduler.init(onTap: (p) => _openFromPayload(ref, p));
    ready = true;
    // The app was started by tapping a reminder.
    _openFromPayload(ref, await scheduler.launchPayload());
  }

  Future<void> sync() async {
    // Not signed in the planner / offline: keep the alarms as they are.
    final tasks = ref.read(tasksProvider((done: false, mine: false))).value;
    if (tasks == null) return;
    try {
      await ensureReady();
      final t = ref.read(translatorProvider);
      final f = ref.read(l10nFormatsProvider);
      await scheduler.sync(
        planReminders(
          tasks,
          DateTime.now(),
          onlyAssignedToMe: ref.read(isAssistantProvider),
        ),
        (_) => t.t('notif.cases.task_reminder.title'),
        (s) => reminderBody(t, f, s),
      );
    } on Object catch (e) {
      debugPrint('task reminders not armed: $e');
    }
  }

  // Back from the background: the list may have changed on another device
  // (or the clock was moved), so it is read again — at most every 10 minutes.
  final observer = _ResumeObserver(() {
    ref.invalidate(tasksProvider((done: false, mine: false)));
  });
  WidgetsBinding.instance.addObserver(observer);

  ref
    ..onDispose(() => WidgetsBinding.instance.removeObserver(observer))
    ..listen(
      tasksProvider((done: false, mine: false)),
      (_, __) => unawaited(sync()),
      fireImmediately: true,
    )
    ..listen(translatorProvider, (_, __) => unawaited(sync()));
});

class _ResumeObserver with WidgetsBindingObserver {
  _ResumeObserver(this._onResume);

  final VoidCallback _onResume;
  DateTime _last = DateTime.now();

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    final now = DateTime.now();
    if (now.difference(_last) < const Duration(minutes: 10)) return;
    _last = now;
    _onResume();
  }
}

/// Owner 2026-10-20: asked at the moment it matters — right after a task
/// with a reminder is saved: if the phone has notifications switched off the
/// system prompt comes up (Android 13+), and if they stay off the person is
/// told once that the reminder cannot reach them, with a way to the phone's
/// settings.
Future<void> ensureReminderPermission(
  BuildContext context,
  WidgetRef ref,
) async {
  if (kIsWeb) return;
  final system = ref.read(systemNotificationsProvider);
  if (await system.enabled()) return;
  if (await system.request()) return;
  if (!context.mounted) return;
  final t = ref.read(translatorProvider);
  showAppSnackBar(
    context,
    t.t('notif.system.off'),
    actionLabel: t.t('notif.system.open'),
    onAction: () => unawaited(system.openSettings()),
  );
}
