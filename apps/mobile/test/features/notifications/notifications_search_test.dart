import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';

class _Repo implements NotificationsRepository {
  final queries = <String?>[];
  final groups = <NotifGroup?>[];

  @override
  Future<CursorPage<AppNotification>> list({
    String? cursor,
    NotifGroup? group,
    String? query,
  }) async {
    queries.add(query);
    groups.add(group);
    final hit = query == null || query.isEmpty;
    return CursorPage(
      items: hit
          ? [
              AppNotification(
                id: 'n1',
                type: 'admin_broadcast',
                category: NotifCategory.system,
                payload: const {'title': 'Plan maintenance'},
                aggregateCount: 1,
                createdAt: DateTime.now(),
              ),
            ]
          : const [],
    );
  }

  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

/// Owner 2026-10-23: the bell has no search any more - no field, no
/// magnifier; the list is asked without a query.
void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('no search in the bell: no field, the list has no query',
      (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(
      uxApp(
        const Scaffold(body: NotificationsView()),
        theme: AppTheme.light(),
        overrides: uxOverrides(
          extra: [notificationsRepositoryProvider.overrideWithValue(repo)],
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(repo.queries, [null]);
    expect(find.byType(TextField), findsNothing);
    expect(find.byKey(const ValueKey('notif-search-open')), findsNothing);
    expect(find.text('Plan maintenance'), findsOneWidget);
  });
}
