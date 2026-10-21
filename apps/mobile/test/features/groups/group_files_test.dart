import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/group_files_screen.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';
import 'fake_group_repository.dart';

api.GroupMessageDto _file(String id, String name, String mime) => message(
      id,
      body: '',
      type: api.GroupMessageDtoType.attachment,
      attachment: api.ChatAttachmentDto(
        fileId: 'f-$id',
        name: name,
        isImage: mime.startsWith('image/'),
        mime: mime,
        sizeBytes: 2048,
      ),
    );

/// Owner 2026-10-21 (Telegram «shared media»): the group's own tabs.
void main() {
  setUpAll(initializeDateFormatting);

  late FakeGroupRepository repo;

  setUp(() {
    repo = FakeGroupRepository()
      ..sharedItems.addAll({
        api.GroupSharedKind.media: [
          for (var i = 0; i < 5; i++) _file('p$i', 'p$i.jpg', 'image/jpeg'),
        ],
        api.GroupSharedKind.files: [
          _file('d0', 'contract.pdf', 'application/pdf'),
        ],
        api.GroupSharedKind.links: [
          message('l0', body: 'read https://lawbid.dev/about now'),
        ],
        api.GroupSharedKind.voice: [_file('v0', 'note.ogg', 'audio/ogg')],
      });
  });

  Future<void> pump(WidgetTester tester) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        const GroupFilesScreen(groupId: 'g1'),
        size: const Size(360, 800),
        theme: AppTheme.light(),
        disableAnimations: true,
        textScale: 1.1,
        overrides: uxOverrides(
          extra: [groupRepositoryProvider.overrideWithValue(repo)],
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('opens on photos and videos; only that tab is asked', (t) async {
    await pump(t);
    expect(repo.sharedCalls, ['media:']);
    expect(find.byKey(const ValueKey('media-photo-p0')), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('scrolling to the end asks the next page by cursor', (t) async {
    await pump(t);
    // The grid is short at 360 dp, so the first page already ends near the
    // bottom: the next page follows from the cursor.
    expect(repo.sharedCalls.length, greaterThanOrEqualTo(1));
    await t.drag(
      find.byKey(const ValueKey('files-media')),
      const Offset(0, -600),
    );
    await t.pumpAndSettle();
    expect(repo.sharedCalls, containsAllInOrder(['media:', 'media:2']));
    expect(t.takeException(), isNull);
  });

  testWidgets('each tab asks its own kind: files, links, voice', (t) async {
    await pump(t);
    await t.tap(find.text('Documents'));
    await t.pumpAndSettle();
    expect(find.text('contract.pdf'), findsOneWidget);
    await t.tap(find.text('Links'));
    await t.pumpAndSettle();
    expect(find.text('lawbid.dev'), findsOneWidget);
    await t.tap(find.text('Voice'));
    await t.pumpAndSettle();
    expect(find.text('note.ogg'), findsOneWidget);
    expect(
      repo.sharedCalls.map((c) => c.split(':').first).toSet(),
      {'media', 'files', 'links', 'voice'},
    );
    expect(t.takeException(), isNull);
  });
}
