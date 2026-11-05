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

  test('R-392: the close request names who asked; kept open = in work', () {
    const en = StaticTranslatorEn();
    const ru = StaticTranslatorRu();
    AppNotification req(String by) => AppNotification(
          id: 'n2',
          type: 'completion_requested',
          category: NotifCategory.cases,
          payload: {'caseId': 'c1', 'by': by},
          aggregateCount: 1,
          createdAt: DateTime(2026, 11, 4),
        );
    expect(
      notificationText(en, req('attorney')),
      'The attorney asks to close the case — confirm or keep it open',
    );
    expect(
      notificationText(ru, req('client')),
      'Клиент предлагает закрыть кейс — подтвердите или оставьте в работе',
    );
    expect(
      notificationText(en, n('close_declined')),
      'Thomas Brennan kept the case open — it stays in work',
    );
    expect(
      notificationRoute(
        type: 'completion_requested',
        payload: const {'caseId': 'c1', 'by': 'client'},
        attorney: true,
      ),
      AppRoutes.workCase('c1'),
    );
  });
}
