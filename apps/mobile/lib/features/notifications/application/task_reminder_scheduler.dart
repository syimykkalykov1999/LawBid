import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:timezone/timezone.dart' as tz;

/// Owner 2026-10-20 («будильники как часики»): the planner's safety net on
/// the phone. Every task with a reminder also gets a local alarm, so a
/// reminder arrives with no network and when a push is late or lost.
/// Android: inexact (no exact-alarm permission), the push replaces the
/// alarm's notification under the same id. iPhone: an exact time-sensitive
/// calendar alarm (iOS keeps at most 64 pending, so only the nearest
/// [maxArmedReminders]
/// are armed); the server sends such a phone only a silent push, which is
/// shown only when the phone's own alarm is not pending or already up.

/// The channel the system notifications already use (MainActivity.kt).
const _channelId = 'general';

/// The payload type of a planner reminder, local or pushed.
const taskReminderType = 'task_reminder';

/// How many upcoming reminders are kept armed (Android allows far more
/// alarms; the nearest ones are enough, the list is re-armed on every
/// start and every change).
const maxArmedReminders = 60;

/// A reminder to arm: [taskId] at [at] for a task of [kind] due at [dueAt].
@immutable
class ReminderSlot {
  const ReminderSlot({
    required this.taskId,
    required this.kind,
    required this.at,
    required this.dueAt,
  });

  final String taskId;
  final TaskKind kind;
  final DateTime at;
  final DateTime dueAt;

  @override
  bool operator ==(Object other) =>
      other is ReminderSlot &&
      other.taskId == taskId &&
      other.kind == kind &&
      other.at == at &&
      other.dueAt == dueAt;

  @override
  int get hashCode => Object.hash(taskId, kind, at, dueAt);
}

/// The reminders that should be armed now: active tasks with a time and a
/// reminder, still ahead, nearest first. A finished, cancelled, archived or
/// moved-away task has none, so its alarm is cancelled by the sync.
List<ReminderSlot> planReminders(
  Iterable<TaskItem> tasks,
  DateTime now, {
  int limit = maxArmedReminders,
  bool onlyAssignedToMe = false,
}) {
  final slots = <ReminderSlot>[];
  for (final t in tasks) {
    final due = t.dueAt;
    final before = t.remindBeforeMin;
    if (!t.status.active || t.archived || due == null || before == null) {
      continue;
    }
    // An assistant is reminded of the tasks given to them only.
    if (onlyAssignedToMe && !t.assignedToMe) continue;
    // The server reminds at the task's own time minus the lead (the
    // checklist steps have no reminder of their own).
    final at = due.subtract(Duration(minutes: before));
    if (!at.isAfter(now)) continue;
    slots.add(
      ReminderSlot(taskId: t.id, kind: t.kind, at: at, dueAt: due),
    );
  }
  slots.sort((a, b) => a.at.compareTo(b.at));
  return slots.length > limit ? slots.sublist(0, limit) : slots;
}

/// A stable positive 31-bit id for a task (FNV-1a): the push for the same
/// task computes the same one, so the two replace each other.
int reminderNotificationId(String taskId) {
  var h = 0x811c9dc5;
  for (final c in taskId.codeUnits) {
    h ^= c;
    h = (h * 0x01000193) & 0xffffffff;
  }
  return h & 0x7fffffff;
}

/// What a notification carries back to the app when it is tapped.
String reminderPayload({
  required String taskId,
  required String kind,
  required DateTime at,
  required DateTime dueAt,
}) =>
    jsonEncode({
      'type': taskReminderType,
      'taskId': taskId,
      'kind': kind,
      'remindAt': at.toUtc().toIso8601String(),
      'dueAt': dueAt.toUtc().toIso8601String(),
    });

/// The local notification's text: the same «kind · time» as the push.
String reminderBody(Translator t, L10nFormats f, ReminderSlot s) =>
    '${t.t('tasks.kind.${s.kind.wire}')} · ${f.time(s.dueAt)}';

/// The slice of the plugin the scheduler uses — a seam for tests.
abstract class LocalNotificationsGateway {
  Future<void> init({
    required void Function(String? payload) onTap,
  });

  /// Payload of the notification that started the app, if one did.
  Future<String?> launchPayload();

  Future<Map<int, String?>> pending();

  /// Ids of the notifications of this app that are on screen now.
  Future<Set<int>> active();

  Future<void> schedule({
    required int id,
    required DateTime at,
    required String title,
    required String body,
    required String payload,
  });

  Future<void> show({
    required int id,
    required String title,
    required String body,
    required String payload,
  });

  Future<void> cancel(int id);
}

/// The real thing: flutter_local_notifications on Android.
class PluginNotificationsGateway implements LocalNotificationsGateway {
  PluginNotificationsGateway([FlutterLocalNotificationsPlugin? plugin])
      : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;
  bool _ready = false;

  static const _details = NotificationDetails(
    android: AndroidNotificationDetails(
      _channelId,
      'LawBid',
      importance: Importance.high,
      priority: Priority.high,
      category: AndroidNotificationCategory.reminder,
      // The push for the same task replaces this one without a second beep.
      onlyAlertOnce: true,
    ),
    iOS: DarwinNotificationDetails(
      presentAlert: true,
      presentSound: true,
      presentBadge: true,
      // Breaks through Focus like a calendar alert (entitlement in
      // Runner.entitlements).
      interruptionLevel: InterruptionLevel.timeSensitive,
      threadIdentifier: 'task-reminders',
    ),
  );

  @override
  Future<void> init({required void Function(String? payload) onTap}) async {
    if (!_ready) {
      await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          // The permission is asked by the push set-up, not here.
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
        ),
        onDidReceiveNotificationResponse: (r) => onTap(r.payload),
      );
      _ready = true;
    }
  }

  @override
  Future<String?> launchPayload() async {
    final d = await _plugin.getNotificationAppLaunchDetails();
    if (d == null || !d.didNotificationLaunchApp) return null;
    return d.notificationResponse?.payload;
  }

  @override
  Future<Map<int, String?>> pending() async {
    final list = await _plugin.pendingNotificationRequests();
    return {for (final p in list) p.id: p.payload};
  }

  @override
  Future<Set<int>> active() async {
    final list = await _plugin.getActiveNotifications();
    return {
      for (final n in list)
        if (n.id != null) n.id!,
    };
  }

  @override
  Future<void> schedule({
    required int id,
    required DateTime at,
    required String title,
    required String body,
    required String payload,
  }) =>
      _plugin.zonedSchedule(
        id: id,
        // An absolute instant: no local zone needed.
        scheduledDate: tz.TZDateTime.from(at, tz.UTC),
        title: title,
        body: body,
        payload: payload,
        notificationDetails: _details,
        // Inexact: no SCHEDULE_EXACT_ALARM; Android may move it by a few
        // minutes, never lose it (and the push is the exact one).
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      );

  @override
  Future<void> show({
    required int id,
    required String title,
    required String body,
    required String payload,
  }) =>
      _plugin.show(
        id: id,
        title: title,
        body: body,
        payload: payload,
        notificationDetails: _details,
      );

  @override
  Future<void> cancel(int id) => _plugin.cancel(id: id);
}

/// Arms and cancels the local reminders. [sync] makes the phone's alarms
/// match the task list exactly.
class TaskReminderScheduler {
  TaskReminderScheduler(this._gateway);

  final LocalNotificationsGateway _gateway;
  Future<void> _queue = Future<void>.value();

  /// Whether this platform keeps local reminders (Android and iPhone; the
  /// web has none).
  static bool get supported =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  /// iPhone: the phone's own alarm is the reminder, the silent push only
  /// fills a gap.
  static bool get _silentPush =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  Future<void> init({required void Function(String? payload) onTap}) =>
      _gateway.init(onTap: onTap);

  Future<String?> launchPayload() => _gateway.launchPayload();

  /// Brings the alarms in line with [slots]: new and moved reminders are
  /// armed (the same id replaces the old alarm), everything else goes.
  /// Runs one at a time, in order.
  Future<void> sync(
    List<ReminderSlot> slots,
    String Function(ReminderSlot) title,
    String Function(ReminderSlot) body,
  ) {
    return _queue = _queue.catchError((Object _) {}).then((_) async {
      final armed = await _gateway.pending();
      final wanted = <int>{};
      for (final s in slots) {
        final id = reminderNotificationId(s.taskId);
        wanted.add(id);
        final payload = reminderPayload(
          taskId: s.taskId,
          kind: s.kind.wire,
          at: s.at,
          dueAt: s.dueAt,
        );
        // Nothing changed: leave the alarm alone.
        if (armed[id] == payload) continue;
        await _gateway.schedule(
          id: id,
          at: s.at,
          title: title(s),
          body: body(s),
          payload: payload,
        );
      }
      for (final id in armed.keys) {
        if (wanted.contains(id)) continue;
        // Only this feature's own alarms are ours to remove.
        if (!_isReminderPayload(armed[id])) continue;
        await _gateway.cancel(id);
      }
    });
  }

  /// A reminder push that arrived (data-only): shown under the
  /// task's id, replacing the local alarm's notification if it is up.
  Future<void> showFromPush(Map<String, dynamic> data) async {
    final taskId = data['taskId'];
    final title = data['title'];
    final body = data['body'];
    if (taskId is! String || title is! String || body is! String) return;
    final id = reminderNotificationId(taskId);
    if (_silentPush &&
        ((await _gateway.pending()).containsKey(id) ||
            (await _gateway.active()).contains(id))) {
      return;
    }
    await _gateway.show(
      id: id,
      title: title,
      body: body,
      payload: jsonEncode({
        'type': taskReminderType,
        'taskId': taskId,
        'kind': data['kind'],
        'notificationId': data['notificationId'],
        'remindAt': data['remindAt'],
        'dueAt': data['dueAt'],
      }),
    );
  }

  /// A task was removed or finished: its alarm and notification go.
  Future<void> cancelTask(String taskId) =>
      _gateway.cancel(reminderNotificationId(taskId));
}

bool _isReminderPayload(String? payload) {
  if (payload == null) return false;
  try {
    final j = jsonDecode(payload);
    return j is Map && j['type'] == taskReminderType;
  } on Object {
    return false;
  }
}

/// The reminder push in the background / killed app (Android, data-only):
/// the app draws it itself, under the id its alarm uses.
@pragma('vm:entry-point')
Future<void> showTaskReminderFromPush(Map<String, dynamic> data) async {
  if (!TaskReminderScheduler.supported) return;
  if (data['type'] != taskReminderType) return;
  final gateway = PluginNotificationsGateway();
  try {
    await gateway.init(onTap: (_) {});
    await TaskReminderScheduler(gateway).showFromPush(data);
  } on Object catch (e) {
    debugPrint('task reminder push not shown: $e');
  }
}
