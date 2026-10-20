import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/notifications/application/task_reminder_scheduler.dart';
import 'package:lawbid/features/team/domain/team_models.dart';

/// Owner 2026-10-20: the phone's reminder alarms equal the planner.
class _Gateway implements LocalNotificationsGateway {
  final armed = <int, String?>{};
  final shown = <int, Map<String, String>>{};
  final log = <String>[];

  @override
  Future<void> init({required void Function(String? payload) onTap}) async {}

  @override
  Future<String?> launchPayload() async => null;

  @override
  Future<Map<int, String?>> pending() async => Map.of(armed);

  @override
  Future<Set<int>> active() async => shown.keys.toSet();

  bool exactOk = false;
  final exactLog = <bool>[];

  @override
  Future<bool> exactAllowed() async => exactOk;

  @override
  Future<void> askExact() async {}

  @override
  Future<void> schedule({
    required int id,
    required DateTime at,
    required String title,
    required String body,
    required String payload,
    bool exact = false,
  }) async {
    exactLog.add(exact);
    log.add('schedule $id');
    armed[id] = payload;
  }

  @override
  Future<void> show({
    required int id,
    required String title,
    required String body,
    required String payload,
  }) async {
    log.add('show $id');
    shown[id] = {'title': title, 'body': body};
  }

  @override
  Future<void> cancel(int id) async {
    log.add('cancel $id');
    armed.remove(id);
    shown.remove(id);
  }
}

TaskItem _task(
  String id, {
  DateTime? due,
  int? before = 15,
  TaskStatus status = TaskStatus.open,
  bool assignedToMe = false,
  DateTime? archivedAt,
}) =>
    TaskItem(
      id: id,
      kind: TaskKind.meeting,
      title: 'secret title $id',
      status: status,
      createdAt: DateTime.utc(2026, 10),
      dueAt: due,
      remindBeforeMin: before,
      assignedToMe: assignedToMe,
      archivedAt: archivedAt,
    );

void main() {
  final now = DateTime.utc(2026, 10, 20, 12);

  group('planReminders', () {
    test('only active tasks with a time and a reminder still ahead', () {
      final slots = planReminders(
        [
          _task('a', due: now.add(const Duration(hours: 2))),
          _task(
            'no-reminder',
            due: now.add(const Duration(hours: 2)),
            before: null,
          ),
          _task('no-time'),
          _task('past', due: now.add(const Duration(minutes: 10))),
          _task(
            'done',
            due: now.add(const Duration(hours: 3)),
            status: TaskStatus.done,
          ),
          _task(
            'archived',
            due: now.add(const Duration(hours: 3)),
            archivedAt: now,
          ),
        ],
        now,
      );
      expect(slots.map((s) => s.taskId), ['a']);
      expect(slots.single.at, now.add(const Duration(hours: 1, minutes: 45)));
    });

    test('nearest first and capped', () {
      final tasks = [
        for (var i = 0; i < 5; i++)
          _task('t$i', due: now.add(Duration(hours: 5 - i))),
      ];
      final slots = planReminders(tasks, now, limit: 3);
      expect(slots.map((s) => s.taskId), ['t4', 't3', 't2']);
    });

    test('an assistant is reminded of their own tasks only', () {
      final tasks = [
        _task(
          'mine',
          due: now.add(const Duration(hours: 2)),
          assignedToMe: true,
        ),
        _task('other', due: now.add(const Duration(hours: 2))),
      ];
      expect(
        planReminders(tasks, now, onlyAssignedToMe: true).map((s) => s.taskId),
        ['mine'],
      );
      expect(planReminders(tasks, now).length, 2);
    });
  });

  test('the notification id is stable, positive and per task', () {
    expect(reminderNotificationId('abc'), reminderNotificationId('abc'));
    expect(reminderNotificationId('abc'), isNot(reminderNotificationId('abd')));
    expect(reminderNotificationId('abc'), inInclusiveRange(0, 0x7fffffff));
  });

  group('TaskReminderScheduler.sync', () {
    late _Gateway gw;
    late TaskReminderScheduler s;
    String title(ReminderSlot _) => 'T';
    String body(ReminderSlot x) => 'B ${x.taskId}';

    setUp(() {
      gw = _Gateway();
      s = TaskReminderScheduler(gw);
    });

    test('arms, leaves unchanged ones alone, re-arms a moved one', () async {
      final a = planReminders(
        [_task('a', due: now.add(const Duration(hours: 2)))],
        now,
      );
      await s.sync(a, title, body);
      expect(gw.armed.length, 1);
      gw.log.clear();

      await s.sync(a, title, body);
      expect(gw.log, isEmpty);

      final moved = planReminders(
        [_task('a', due: now.add(const Duration(hours: 4)))],
        now,
      );
      await s.sync(moved, title, body);
      expect(gw.log, ['schedule ${reminderNotificationId('a')}']);
      expect(gw.armed.length, 1);
    });

    test('exact when the person allowed it; re-armed exact once allowed',
        () async {
      final a = planReminders(
        [_task('a', due: now.add(const Duration(hours: 2)))],
        now,
      );
      await s.sync(a, title, body);
      expect(gw.exactLog, [false]);

      gw.exactOk = true;
      await s.sync(a, title, body);
      expect(gw.exactLog, [false, true]);

      gw.log.clear();
      await s.sync(a, title, body);
      expect(gw.log, isEmpty);
    });

    test('done, deleted or moved-away tasks lose their alarm', () async {
      final both = planReminders(
        [
          _task('a', due: now.add(const Duration(hours: 2))),
          _task('b', due: now.add(const Duration(hours: 3))),
        ],
        now,
      );
      await s.sync(both, title, body);
      expect(gw.armed.length, 2);

      await s.sync(
        planReminders(
          [
            _task(
              'a',
              due: now.add(const Duration(hours: 2)),
              status: TaskStatus.done,
            ),
          ],
          now,
        ),
        title,
        body,
      );
      expect(gw.armed, isEmpty);
    });

    test('foreign notifications are never cancelled', () async {
      gw.armed[7] = jsonEncode({'type': 'incoming_call'});
      gw.armed[8] = null;
      await s.sync(const [], title, body);
      expect(gw.armed.keys, containsAll([7, 8]));
    });

    test('a pushed reminder takes the id of the task alarm', () async {
      await s.showFromPush({
        'taskId': 'a',
        'title': 'Task reminder',
        'body': 'Meeting · 14:30',
      });
      expect(gw.shown.keys, [reminderNotificationId('a')]);
      await s.showFromPush({'taskId': 'a'});
      expect(gw.shown.length, 1);
    });

    test('a pushed reminder cancels the armed alarm first', () async {
      final a = planReminders(
        [_task('a', due: now.add(const Duration(hours: 2)))],
        now,
      );
      await s.sync(a, title, body);
      gw.log.clear();
      await s.showFromPush({'taskId': 'a', 'title': 'T', 'body': 'B'});
      final id = reminderNotificationId('a');
      expect(gw.log, ['cancel $id', 'show $id']);
      expect(gw.armed, isEmpty);
    });

    test('cancelTask removes the alarm', () async {
      final a = planReminders(
        [_task('a', due: now.add(const Duration(hours: 2)))],
        now,
      );
      await s.sync(a, title, body);
      await s.cancelTask('a');
      expect(gw.armed, isEmpty);
    });
  });
}
