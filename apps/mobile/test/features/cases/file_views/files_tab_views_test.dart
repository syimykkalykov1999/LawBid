import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/cases/file_views/application/file_views_providers.dart';
import 'package:lawbid/features/cases/file_views/data/file_views_repository.dart';
import 'package:lawbid/features/cases/file_views/domain/file_view.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid/features/cases/workspace/workspace_view.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../../helpers/long_locale.dart';
import '../../../helpers/ux_harness.dart';

class _Remote implements FileViewsRemote {
  @override
  Future<FileViewsPage> page(
    String fileId, {
    String? cursor,
    DateTime? since,
  }) async =>
      FileViewsPage(
        items: [
          FileView(
            id: 'v1',
            viewerUserId: 'u2',
            viewerName: 'Ann Lee',
            viewerRole: 'attorney',
            viewedAt: DateTime.utc(2026, 10, 24, 9),
            device: 'iPhone 15',
            platform: 'ios',
            ipMasked: '203.0.113.x',
          ),
        ],
      );
}

api.WorkspaceFileDto _file(String id, {int? views}) => api.WorkspaceFileDto(
      fileId: id,
      url: 'https://x.test/$id.pdf',
      previewUrl: 'https://x.test/$id.png',
      mime: 'application/pdf',
      sizeBytes: 10,
      source: api.WorkspaceFileDtoSource.valueCase,
      sample: false,
      addedByRole: api.WorkspaceFileDtoAddedByRole.client,
      addedAt: '2026-10-24T08:00:00.000Z',
      description: 'Contract with a very long descriptive title ' * 3,
      viewCount: views,
    );

void main() {
  setUpAll(() async => initializeDateFormatting('en'));

  Future<void> pump(
    WidgetTester tester, {
    required ThemeData theme,
    required List<api.WorkspaceFileDto> files,
    double scale = 1,
    bool longest = false,
  }) async {
    useNarrowPhone(tester);
    final db = CacheDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await tester.pumpWidget(
      uxApp(
        const Scaffold(
          body: SingleChildScrollView(
            child: FilesTab(caseId: 'k', isAttorney: false),
          ),
        ),
        theme: theme,
        textScale: scale,
        disableAnimations: true,
        overrides: uxOverrides(
          translator:
              longest ? LongestTranslator() : const StaticTranslatorEn(),
          extra: [
            caseFilesProvider('k').overrideWith((ref) async => files),
            fileViewsRemoteProvider.overrideWithValue(_Remote()),
            fileViewsStoreProvider.overrideWithValue(FileViewsStore(db, 'me')),
            realtimeEventsProvider
                .overrideWithValue(const Stream<RealtimeEvent>.empty()),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  for (final id in AppThemeId.values) {
    testWidgets('badge only on own viewed files, no overflow in ${id.name}',
        (tester) async {
      await pump(
        tester,
        theme: AppTheme.of(id),
        files: [_file('f1', views: 7), _file('f2', views: 0), _file('f3')],
        longest: true,
        scale: 1.6,
      );
      // One badge: the viewed file; not on 0 views, not on others' files.
      expect(find.byKey(const ValueKey('file-views-badge')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('the badge opens «Views»; long-press does too', (tester) async {
    await pump(
      tester,
      theme: AppTheme.light(),
      files: [_file('f1', views: 2)],
    );
    await tester.tap(find.byKey(const ValueKey('file-views-badge')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Ann Lee'), findsOneWidget);
    await tester.tap(find.byType(AppBackButton));
    await tester.pumpAndSettle();
    await tester.longPress(find.textContaining('Contract').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Ann Lee'), findsOneWidget);
  });

  testWidgets('a file that is not mine has no entry at all', (tester) async {
    await pump(tester, theme: AppTheme.light(), files: [_file('f3')]);
    await tester.longPress(find.textContaining('Contract').first);
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Ann Lee'), findsNothing);
  });
}
