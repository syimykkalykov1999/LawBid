import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/root_messenger.dart';
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
  // Reminders already seen; one that appears later is a new one → permission.
  Set<String>? known;
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
      final slots = planReminders(
        tasks,
        DateTime.now(),
        onlyAssignedToMe: ref.read(isAssistantProvider),
      );
      await scheduler.sync(
        slots,
        (_) => t.t('notif.cases.task_reminder.title'),
        (s) => reminderBody(t, f, s),
      );
      final now = {for (final s in slots) '${s.taskId}@${s.at}'};
      final added = known != null && now.difference(known!).isNotEmpty;
      known = now;
      if (added) unawaited(_ensureReminderPermission(ref));
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

/// Owner 2026-10-20: asked at the moment it matters — when a reminder is
/// added to the planner (the list sync sees a new one): if the phone has
/// notifications switched off the system prompt comes up (Android 13+), and
/// if they stay off the person is told that the reminder cannot reach them,
/// with a way to the phone's settings. Shown on the app-wide messenger, so
/// it needs no screen of its own (the team feature does not import this).
Future<void> _ensureReminderPermission(Ref ref) async {
  final system = ref.read(systemNotificationsProvider);
  if (await system.enabled()) return;
  if (await system.request()) return;
  final t = ref.read(translatorProvider);
  rootMessengerKey.currentState
    ?..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(t.t('notif.system.off')),
        action: SnackBarAction(
          label: t.t('notif.system.open'),
          onPressed: () => unawaited(system.openSettings()),
        ),
      ),
    );
}
