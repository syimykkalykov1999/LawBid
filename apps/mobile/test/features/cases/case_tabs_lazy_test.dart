import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/file_views/application/file_views_providers.dart';
import 'package:lawbid/features/cases/file_views/data/file_views_repository.dart';
import 'package:lawbid/features/cases/file_views/domain/file_view.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_sections.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid/features/cases/workspace/workspace_view.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/ux_harness.dart';
import 'support/fake_case_files_remote.dart';

/// App audit 2026-10-26 A16: the case tabs built every row of a long list at
/// once (hundreds of files / history entries on a busy case). A tab's list
/// is now a sliver: only the rows on screen (and a little ahead) are built,
/// the rows and the page look the same.
api.WorkspaceFileDto _file(int i) => api.WorkspaceFileDto(
      fileId: 'f$i',
      url: 'https://x.test/f$i.pdf',
      previewUrl: 'https://x.test/f$i.png',
      mime: 'application/pdf',
      sizeBytes: 10,
      source: api.WorkspaceFileDtoSource.valueCase,
      sample: false,
      addedByRole: api.WorkspaceFileDtoAddedByRole.client,
      addedAt: '2026-10-24T08:00:00.000Z',
      description: 'Document $i',
    );

class _NoViews implements FileViewsRemote {
  @override
  Future<FileViewsPage> page(
    String fileId, {
    String? cursor,
    DateTime? since,
  }) async =>
      const FileViewsPage(items: []);
}

void main() {
  setUpAll(() async => initializeDateFormatting('en'));

  testWidgets('a long Files tab builds only the rows on screen',
      (tester) async {
    final db = CacheDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    final files = [for (var i = 0; i < 300; i++) _file(i)];
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: CustomScrollView(
            slivers: [
              CaseSubTabs(
                labels: const ['Documents', 'Photos'],
                index: 0,
                onChanged: (_) {},
                minHeight: 400,
                sliverTabs: const {0},
                builders: [
                  (_) => const FilesTab(
                        caseId: 'k',
                        isAttorney: false,
                        asSliver: true,
                      ),
                  (_) => const SizedBox(height: 10),
                ],
              ),
            ],
          ),
        ),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            caseFilesProvider('k').overrideWith((ref) async => files),
            caseFilesRemoteProvider
                .overrideWithValue(FakeCaseFilesRemote(files)),
            fileViewsRemoteProvider.overrideWithValue(_NoViews()),
            fileViewsStoreProvider.overrideWithValue(FileViewsStore(db, 'me')),
            realtimeEventsProvider
                .overrideWithValue(const Stream<RealtimeEvent>.empty()),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    final built = find.textContaining('Document ', skipOffstage: false);
    expect(built, findsWidgets);
    expect(
      tester.widgetList(built).length,
      lessThan(60),
      reason: 'not all 300 rows at once',
    );
    // Scrolling down builds the rows that come in.
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -6000));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Document 0'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
