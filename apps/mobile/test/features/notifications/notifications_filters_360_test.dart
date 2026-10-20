import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

class _Repo implements NotificationsRepository {
  @override
  Future<CursorPage<AppNotification>> list({
    String? cursor,
    NotifGroup? group,
    String? query,
  }) async =>
      const CursorPage(items: []);

  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

/// Owner 2026-10-20: on a 360 dp phone in Russian the «Остальные» filter
/// was cut by the "Mark all read" button; the button is an icon now, so all
/// three filters sit left of it.
void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('the three filters end before the mark-all icon (ru, 360 dp)',
      (tester) async {
    useNarrowPhone(tester);
    final t = L10nTranslator(language: AppLanguage.ru, cache: const {});
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: NotificationsView(
            trailing: AppIconButton(
              key: const ValueKey('notif-mark-all'),
              icon: const Icon(Icons.done_all),
              semanticLabel: 'x',
              onPressed: () {},
            ),
          ),
        ),
        theme: AppTheme.dark(),
        size: narrowPhone,
        overrides: uxOverrides(
          translator: t,
          extra: [
            notificationsRepositoryProvider.overrideWithValue(_Repo()),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    final other =
        tester.getRect(find.byKey(const ValueKey('notif-view-other')));
    final icon = tester.getRect(find.byKey(const ValueKey('notif-mark-all')));
    expect(other.right, lessThanOrEqualTo(icon.left));
  });
}
