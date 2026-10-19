import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';

/// Audit 2026-10-19: what one side adds in a case in work reaches the
/// other side — the bell says what was added and opens the case.
void main() {
  AppNotification n(Object? kind) => AppNotification(
        id: 'n1',
        type: 'case_workspace_activity',
        category: NotifCategory.cases,
        payload: {'caseId': 'c1', 'kind': kind},
        actor: const NotifActor(displayName: 'Thomas Brennan'),
        aggregateCount: 1,
        createdAt: DateTime(2026, 10, 19),
      );

  test('the text names who and what', () {
    const en = StaticTranslatorEn();
    expect(
      notificationText(en, n('task_added')),
      'Thomas Brennan added a task to the case',
    );
    expect(
      notificationText(en, n('details')),
      'Thomas Brennan changed the case details',
    );
    // an unknown kind still reads as news in the case
    expect(
      notificationText(en, n('???')),
      'Thomas Brennan posted an update in the case',
    );
    const ru = StaticTranslatorRu();
    expect(
      notificationText(ru, n('task_done')),
      'Thomas Brennan выполнил(а) задачу в кейсе',
    );
  });

  test('a tap opens the case: the work card or My case', () {
    String? to({required bool attorney}) => notificationRoute(
          type: 'case_workspace_activity',
          payload: const {'caseId': 'c1', 'kind': 'update'},
          attorney: attorney,
        );
    expect(to(attorney: true), AppRoutes.workCase('c1'));
    expect(to(attorney: false), AppRoutes.myCase('c1'));
  });
}
