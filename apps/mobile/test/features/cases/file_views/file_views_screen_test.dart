import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/file_views/application/file_views_providers.dart';
import 'package:lawbid/features/cases/file_views/data/file_views_repository.dart';
import 'package:lawbid/features/cases/file_views/domain/file_view.dart';
import 'package:lawbid/features/cases/file_views/presentation/file_views_screen.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';

import '../../../helpers/long_locale.dart';
import '../../../helpers/ux_harness.dart';

class _Remote implements FileViewsRemote {
  _Remote(this.rows, {this.fail = false});

  final List<FileView> rows;
  final bool fail;

  @override
  Future<FileViewsPage> page(
    String fileId, {
    String? cursor,
    DateTime? since,
  }) async {
    if (fail) {
      throw const ApiException(code: 'INTERNAL', message: 'boom');
    }
    return FileViewsPage(items: rows);
  }
}

const _long =
    'Wolfeschlegelsteinhausenbergerdorff Konstantinopolitanischer-Schmidt';

List<FileView> _rows() => [
      FileView(
        id: 'a',
        viewerUserId: 'u1',
        viewerName: _long,
        viewerRole: 'attorney',
        viewedAt: DateTime.utc(2026, 10, 24, 18, 30),
        device: 'Samsung Galaxy S24 Ultra Enterprise Edition Dev Build',
        platform: 'android',
        ipMasked: '2001:db8:1::x',
      ),
      FileView(
        id: 'b',
        viewerUserId: 'u2',
        viewedAt: DateTime.utc(2026, 10, 23, 9, 5),
        viewerRole: 'assistant',
        platform: 'web',
        ipMasked: '203.0.113.x',
      ),
      FileView(
        id: 'c',
        viewerUserId: 'u3',
        viewerName: 'Ann Lee',
        viewerRole: 'client',
        viewedAt: DateTime.utc(2026, 10, 22, 7),
      ),
    ];

void main() {
  setUpAll(() async => initializeDateFormatting('en'));

  Future<void> pump(
    WidgetTester tester,
    List<FileView> rows, {
    required ThemeData theme,
    Translator t = const StaticTranslatorEn(),
    double scale = 1,
    TextDirection dir = TextDirection.ltr,
    bool fail = false,
  }) async {
    useNarrowPhone(tester);
    final db = CacheDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await tester.pumpWidget(
      Directionality(
        textDirection: dir,
        child: uxApp(
          const FileViewsScreen(fileId: 'f1'),
          theme: theme,
          textScale: scale,
          disableAnimations: true,
          overrides: uxOverrides(
            translator: t,
            extra: [
              fileViewsRemoteProvider
                  .overrideWithValue(_Remote(rows, fail: fail)),
              fileViewsStoreProvider
                  .overrideWithValue(FileViewsStore(db, 'me')),
              realtimeEventsProvider
                  .overrideWithValue(const Stream<RealtimeEvent>.empty()),
            ],
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  for (final id in AppThemeId.values) {
    testWidgets('rows read well and never overflow in ${id.name}',
        (tester) async {
      await pump(tester, _rows(), theme: AppTheme.of(id));
      expect(find.text('Views'), findsOneWidget);
      expect(find.text('Ann Lee'), findsOneWidget);
      expect(find.text('Assistant'), findsOneWidget);
      expect(find.textContaining('203.0.113.x'), findsOneWidget);
      // No full address ever reaches the screen.
      expect(find.textContaining('203.0.113.9'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('longest strings, 2x text, RTL: no overflow in ${id.name}',
        (tester) async {
      await pump(
        tester,
        _rows(),
        theme: AppTheme.of(id),
        t: LongestTranslator(),
        scale: 2,
        dir: TextDirection.rtl,
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('shown dates are in the phone time zone, not UTC text',
      (tester) async {
    await pump(tester, _rows(), theme: AppTheme.light());
    // 2026-10-24 18:30 UTC, formatted by the app's own formats.
    expect(find.textContaining('2026'), findsWidgets);
  });

  testWidgets('empty list says so', (tester) async {
    await pump(tester, const [], theme: AppTheme.light());
    expect(find.text('Nobody has opened this document yet'), findsOneWidget);
  });

  testWidgets('a failed first load shows the error with Retry', (tester) async {
    await pump(tester, const [], theme: AppTheme.light(), fail: true);
    expect(find.byKey(const ValueKey('file-views-error')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
