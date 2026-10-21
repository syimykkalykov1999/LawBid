import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/notifications/application/task_reminders.dart';

/// Owner 2026-10-21: the «Alarms & reminders» screen is asked only when a
/// reminder is added, never because reminders already existed at sign-in.
void main() {
  test('the first read after sign-in never asks, even with reminders', () {
    expect(reminderAdded(null, {'a@1', 'b@2'}), isFalse);
    expect(reminderAdded(null, <String>{}), isFalse);
  });

  test('an unchanged or shrunk list never asks', () {
    expect(reminderAdded({'a@1', 'b@2'}, {'a@1', 'b@2'}), isFalse);
    expect(reminderAdded({'a@1', 'b@2'}, {'a@1'}), isFalse);
  });

  test('a new reminder asks', () {
    expect(reminderAdded({'a@1'}, {'a@1', 'b@2'}), isTrue);
    expect(reminderAdded(<String>{}, {'a@1'}), isTrue);
  });
}
