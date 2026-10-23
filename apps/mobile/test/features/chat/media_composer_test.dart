// ignore_for_file: lines_longer_than_80_chars
import 'dart:convert';
import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/chat_media_outbox.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/image_edit.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/application/send_picked.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/media_preview_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/upload_queue_overrides.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-22 (WhatsApp): a picked photo / video is NOT sent at once;
/// the preview opens (thumbnails, caption, rotate / crop), then one album
/// goes to the persistent upload queue.
final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
);

PickedFile _img(String name) => (bytes: _png, name: name, mime: 'image/png');

typedef PickedFile = ({Uint8List bytes, String name, String mime});

class _Chat implements ChatRepository {
  final sent = <String>[];
  final captions = <String?>[];

  @override
  Future<Conversation> conversation(String id) async => Conversation(
        id: 'c1',
        caseId: 'case-1',
        caseTitle: 'Lease',
        status: ConversationStatus.active,
        contactsUnlocked: true,
        counterpart: const Counterpart(isAttorney: true, verified: true),
        unreadCount: 0,
        updatedAt: DateTime(2026),
      );

  @override
  Future<CursorPage<ChatMessage>> messages(String id, {String? cursor}) async =>
      const CursorPage(items: []);

  @override
  Future<ChatMessage> sendAttachment(
    String id,
    String clientMessageId, {
    required String fileId,
    required String fileName,
    String? caption,
  }) async {
    sent.add(fileName);
    captions.add(caption);
    return ChatMessage(
      id: 'srv-${sent.length}',
      conversationId: 'c1',
      senderId: 'me',
      kind: MessageKind.attachment,
      body: caption ?? '',
      clientMessageId: clientMessageId,
      createdAt: DateTime.now(),
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

class _Host {
  _Host(this.container, this.result);

  final ProviderContainer container;
  MediaPreviewResult? result;
  bool done = false;
}

Future<_Host> _open(
  WidgetTester tester,
  List<PickedFile> files, {
  String caption = '',
  _Chat? chat,
}) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final c = ProviderContainer(
    overrides: [
      ...uxOverrides(),
      chatRepositoryProvider.overrideWithValue(chat ?? _Chat()),
      currentUserIdProvider.overrideWithValue('me'),
      realtimeClientProvider.overrideWithValue(null),
    ],
  );
  addTearDown(c.dispose);
  final host = _Host(c, null);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: c,
      child: MaterialApp(
        theme: AppTheme.light(),
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async {
                host
                  ..result = await showMediaPreview(
                    context,
                    files: files,
                    caption: caption,
                  )
                  ..done = true;
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  return host;
}

ProviderContainer _queueContainer(_Chat chat) {
  final db = SocialLocalDatabase(NativeDatabase.memory());
  final c = ProviderContainer(
    overrides: [
      chatRepositoryProvider.overrideWithValue(chat),
      socialLocalDatabaseProvider.overrideWithValue(db),
      ...uploadQueueOverrides(),
      currentUserIdProvider.overrideWithValue('me'),
      realtimeClientProvider.overrideWithValue(null),
      networkInterfaceMonitorProvider.overrideWithValue(FakeNetworkMonitor()),
      reachabilityProbeProvider.overrideWithValue(FakeProbe().call),
    ],
  );
  addTearDown(() async {
    c.dispose();
    await db.close();
  });
  return c;
}

void main() {
  setUpAll(initializeDateFormatting);
  test('the preview result goes to the upload queue in order, caption last',
      () async {
    final chat = _Chat();
    final c = _queueContainer(chat);
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await Future<void>.delayed(const Duration(milliseconds: 80));
    await sendPickedFiles(
      c.read(chatThreadProvider('c1').notifier),
      [_img('a.png'), _img('b.png'), _img('c.png')],
      'Lease pages',
    );
    await c.read(chatMediaOutboxProvider).drain();
    await Future<void>.delayed(const Duration(milliseconds: 80));
    expect(chat.sent, ['a.png', 'b.png', 'c.png']);
    expect(chat.captions, [null, null, 'Lease pages']);
  });

  testWidgets('pick three photos -> preview -> caption -> send as one album',
      (tester) async {
    final chat = _Chat();
    final host = await _open(
      tester,
      [_img('a.png'), _img('b.png'), _img('c.png')],
      chat: chat,
    );
    // Big preview, thumbnails strip and the count on the send button.
    expect(find.byKey(const ValueKey('preview-pages')), findsOneWidget);
    expect(find.byKey(const ValueKey('preview-strip')), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('preview-count')),
        matching: find.text('3'),
      ),
      findsOneWidget,
    );
    // Nothing was sent by picking.
    expect(chat.sent, isEmpty);

    await tester.enterText(
      find.byKey(const ValueKey('preview-caption')),
      '  Lease pages  ',
    );
    await tester.tap(find.byKey(const ValueKey('preview-send')));
    await tester.pumpAndSettle();

    final r = host.result!;
    expect(r.files.map((f) => f.name), ['a.png', 'b.png', 'c.png']);
    expect(r.caption, 'Lease pages');
  });

  testWidgets('the typed text is the caption; one photo has no strip / count',
      (tester) async {
    final host = await _open(tester, [_img('a.png')], caption: 'Hello');
    expect(find.byKey(const ValueKey('preview-strip')), findsNothing);
    expect(find.byKey(const ValueKey('preview-count')), findsNothing);
    expect(find.text('Hello'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('preview-send')));
    await tester.pumpAndSettle();
    expect(host.result!.caption, 'Hello');
    expect(host.result!.files, hasLength(1));
  });

  testWidgets('removing a photo drops it from the album', (tester) async {
    final host = await _open(
      tester,
      [_img('a.png'), _img('b.png'), _img('c.png')],
    );
    await tester.tap(find.byKey(const ValueKey('preview-remove')));
    await tester.pumpAndSettle();
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('preview-count')),
        matching: find.text('2'),
      ),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const ValueKey('preview-send')));
    await tester.pumpAndSettle();
    expect(host.result!.files.map((f) => f.name), ['b.png', 'c.png']);
  });

  testWidgets('closing the preview sends nothing', (tester) async {
    final chat = _Chat();
    final host = await _open(tester, [_img('a.png')], chat: chat);
    await tester.tap(find.byIcon(AppIcons.closeRounded));
    await tester.pumpAndSettle();
    expect(host.done, isTrue);
    expect(host.result, isNull);
    expect(chat.sent, isEmpty);
  });

  testWidgets('rotate turns the photo into a JPEG', (tester) async {
    final host = await _open(tester, [_img('shot.png')]);
    await tester.tap(find.byKey(const ValueKey('preview-rotate')));
    // The turn runs on a real isolate: wait for the spinner to go.
    for (var i = 0; i < 50; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 100)),
      );
      await tester.pump();
      if (find.byType(CircularProgressIndicator).evaluate().isEmpty) break;
    }
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('preview-send')));
    await tester.pumpAndSettle();
    final f = host.result!.files.single;
    expect(f.name, 'shot.jpg');
    expect(f.mime, 'image/jpeg');
    // JPEG signature.
    expect(f.bytes.sublist(0, 2), [0xFF, 0xD8]);
  });

  testWidgets('a video or a document has no rotate / crop', (tester) async {
    await _open(
      tester,
      [(bytes: Uint8List(10), name: 'clip.mp4', mime: 'video/mp4')],
    );
    expect(find.byKey(const ValueKey('preview-rotate')), findsNothing);
    expect(find.byKey(const ValueKey('preview-crop')), findsNothing);
    expect(find.text('clip.mp4'), findsOneWidget);
  });

  test('the edit maths: turns swap the size, identity detected', () {
    expect(turnedSize(400, 300, 1).width, 300);
    expect(turnedSize(400, 300, 2).width, 400);
    expect(const ImageEdit().isIdentity, isTrue);
    expect(const ImageEdit().turned().isIdentity, isFalse);
    expect(editedName('IMG.0001.HEIC'), 'IMG.0001.jpg');
  });
}
