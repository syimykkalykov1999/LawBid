import 'dart:async';
import 'dart:convert';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/root_messenger.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
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

/// Opens the screen a tapped reminder names. The planner is a tab, so the
/// route replaces the stack instead of pushing a second copy (a push of a
/// page already on the stack throws «!keyReservation.contains(key)»); a tap
/// while that screen is already shown does nothing.
@visibleForTesting
void openReminderRoute(GoRouter router, String route) {
  final here = router.routerDelegate.currentConfiguration.uri;
  if (here.path == Uri.parse(route).path) return;
  router.go(route);
}

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
    if (route != null) openReminderRoute(ref.read(appRouterProvider), route);
  } on Object catch (e) {
    debugPrint('reminder tap ignored: $e');
  }
}

/// Keeps the phone's alarms equal to the planner: listens to the active
/// task list (every create / edit / done / delete / move refreshes it) and
/// to the interface language, and re-arms. Watched for the whole signed-in
/// session by `sessionServicesProvider`; a no-op off Android.
/// A reminder that was not in the list before: the first list read after
/// sign-in ([before] null) only learns what exists and never counts.
@visibleForTesting
bool reminderAdded(Set<String>? before, Set<String> now) =>
    before != null && now.difference(before).isNotEmpty;

final taskReminderSyncProvider = Provider<void>((ref) {
  if (!TaskReminderScheduler.supported) return;
  if (ref.watch(currentUserIdProvider) == null) return;
  final scheduler = ref.read(taskReminderSchedulerProvider);
  var ready = false;
  // Reminders already seen; one that appears later is a new one → permission.
  Set<String>? known;
  // The exact-alarm screen was opened (by a new reminder): the next return
  // re-reads at once.
  var recheck = false;
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
      unawaited(_reportArmed(ref, slots));
      final now = {for (final s in slots) '${s.taskId}@${s.at}'};
      final added = reminderAdded(known, now);
      known = now;
      // Owner 2026-10-21 (Telegram / WhatsApp): the phone's «Alarms &
      // reminders» screen opens only when the person adds a reminder, never
      // on sign-in or at start; refused → inexact alarms, no more asking.
      if (added) {
        unawaited(
          _ensureReminderPermission(ref).then((opened) {
            if (opened) recheck = true;
          }),
        );
      }
    } on Object catch (e) {
      debugPrint('task reminders not armed: $e');
    }
  }

  // Back from the background: the list may have changed on another device
  // (or the clock was moved), so it is read again — at most every 10 minutes.
  final observer = _ResumeObserver(
    () {
      recheck = false;
      ref.invalidate(tasksProvider((done: false, mine: false)));
    },
    () => recheck,
  );
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
  _ResumeObserver(this._onResume, this._force);

  final VoidCallback _onResume;
  DateTime _last = DateTime.now();
  final bool Function() _force;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    final now = DateTime.now();
    if (!_force() && now.difference(_last) < const Duration(minutes: 10)) {
      return;
    }
    _last = now;
    _onResume();
  }
}

/// Owner 2026-10-20: an iPhone tells the server which reminders it holds as
/// local alarms, so the reminder push skips exactly those (no double banner;
/// a reminder made elsewhere and not armed here still arrives by push).
Future<void> _reportArmed(Ref ref, List<ReminderSlot> slots) async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.iOS) return;
  try {
    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) return;
    // Notifications switched off: no alarm will show, so nothing counts as
    // armed and the push goes out (it may be allowed separately).
    final on = await ref.read(systemNotificationsProvider).enabled();
    await ref.read(notificationsRepositoryProvider).setArmedReminders(token, [
      if (on)
        for (final s in slots) '${s.taskId}@${s.at.millisecondsSinceEpoch}',
    ]);
  } on Object catch (e) {
    debugPrint('armed reminders not reported: $e');
  }
}

/// Owner 2026-10-20: asked at the moment it matters — when a reminder is
/// added to the planner (the list sync sees a new one): if the phone has
/// notifications switched off the system prompt comes up (Android 13+), and
/// if they stay off the person is told that the reminder cannot reach them,
/// with a way to the phone's settings. Shown on the app-wide messenger, so
/// it needs no screen of its own (the team feature does not import this).
Future<bool> _ensureReminderPermission(Ref ref) async {
  final system = ref.read(systemNotificationsProvider);
  if (!await system.enabled() && !await system.request()) {
    await _tellNotificationsOff(ref, system);
    return false;
  }
  final opened = await _askExactAlarms(ref);
  if (opened) ref.invalidate(tasksProvider((done: false, mine: false)));
  return opened;
}

/// Android 12+: an alarm at the minute needs the person's «Alarms & reminders»
/// switch; asked once (the system screen opens), inexact until it is on.
/// True when the system screen was opened.
Future<bool> _askExactAlarms(Ref ref) async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return false;
  try {
    final scheduler = ref.read(taskReminderSchedulerProvider);
    if (await scheduler.exactAllowed()) return false;
    final prefs = ref.read(sharedPreferencesProvider);
    if (prefs.getBool(_exactAskedKey) ?? false) return false;
    await prefs.setBool(_exactAskedKey, true);
    await scheduler.askExact();
    return true;
  } on Object catch (e) {
    debugPrint('exact alarms not asked: $e');
    return false;
  }
}

const _exactAskedKey = 'reminders.exactAsked';

Future<void> _tellNotificationsOff(
  Ref ref,
  SystemNotifications system,
) async {
  final t = ref.read(translatorProvider);
  rootMessengerKey.currentState
    ?..hideCurrentSnackBar()
    ..showSnackBar(
      reminderPermissionSnackBar(t, () => unawaited(system.openSettings())),
    );
}

/// The «notifications are off» message with a way to the phone's settings.
SnackBar reminderPermissionSnackBar(Translator t, VoidCallback onOpen) =>
    SnackBar(
      content: Text(t.t('notif.system.off')),
      action: SnackBarAction(
        label: t.t('notif.system.open'),
        onPressed: onOpen,
      ),
    );
