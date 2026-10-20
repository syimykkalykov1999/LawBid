import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/domain/message_groups.dart';
import 'package:lawbid/features/chat/presentation/chat_album.dart';

final _t0 = DateTime.utc(2026, 10, 19, 12);

ChatMessage _photo(
  int i, {
  String sender = 'me',
  Duration? at,
  String caption = '',
  bool doc = false,
}) =>
    ChatMessage(
      id: 'm$i',
      conversationId: 'c',
      senderId: sender,
      kind: MessageKind.attachment,
      body: caption,
      createdAt: _t0.add(at ?? Duration(seconds: i)),
      attachment: ChatAttachment(
        fileId: 'f$i',
        name: doc ? 'f$i.pdf' : 'p$i.jpg',
        isImage: !doc,
        mime: doc ? 'application/pdf' : 'image/jpeg',
      ),
    );

/// The thread's order is newest first.
List<ChatListEntry> _group(List<ChatMessage> oldestFirst) =>
    groupChatMessages(oldestFirst.reversed.toList());

List<int> _sizes(List<ChatListEntry> e) =>
    e.reversed.map((x) => x.messages.length).toList();

void main() {
  for (final n in [2, 3, 4, 10]) {
    test('$n photos sent together form one album', () {
      final entries = _group([for (var i = 0; i < n; i++) _photo(i)]);
      expect(entries, hasLength(1));
      expect(entries.single.messages.map((m) => m.id), [
        for (var i = 0; i < n; i++) 'm$i',
      ]);
      expect(entries.single.newest.id, 'm${n - 1}');
      expect(chatAlbumLayout(n), hasLength(n));
    });
  }

  test('11 photos: an album of 10, then one', () {
    final entries = _group([for (var i = 0; i < 11; i++) _photo(i)]);
    expect(_sizes(entries), [10, 1]);
    expect(entries.first.isGroup, isFalse);
  });

  test('a different sender breaks the album', () {
    final entries = _group([
      _photo(0),
      _photo(1),
      _photo(2, sender: 'other'),
      _photo(3, sender: 'other'),
    ]);
    expect(_sizes(entries), [2, 2]);
  });

  test('more than a minute apart breaks the album', () {
    final entries = _group([
      _photo(0),
      _photo(1),
      _photo(2, at: const Duration(minutes: 3)),
    ]);
    expect(_sizes(entries), [2, 1]);
  });

  test('a caption only on the last: it closes the album', () {
    expect(
      _sizes(_group([_photo(0), _photo(1, caption: 'hi'), _photo(2)])),
      [2, 1],
    );
    expect(
      _sizes(_group([_photo(0, caption: 'hi'), _photo(1), _photo(2)])),
      [1, 2],
    );
  });

  test('photos and documents group separately', () {
    final entries = _group([
      _photo(0),
      _photo(1),
      _photo(2, doc: true),
      _photo(3, doc: true),
      _photo(4, doc: true),
    ]);
    expect(_sizes(entries), [2, 3]);
  });

  test('a text between attachments breaks the album', () {
    final text = ChatMessage(
      id: 't',
      conversationId: 'c',
      senderId: 'me',
      kind: MessageKind.text,
      body: 'x',
      createdAt: _t0.add(const Duration(seconds: 1, milliseconds: 500)),
    );
    final entries = _group([_photo(0), _photo(1), text, _photo(2)]);
    expect(_sizes(entries), [2, 1, 1]);
  });

  test('album layouts fill the width without overlap', () {
    for (var n = 2; n <= 10; n++) {
      final cells = chatAlbumLayout(n, firstAspect: n.isEven ? 0.75 : 1.5);
      expect(cells, hasLength(n));
      for (final c in cells) {
        expect(c.left, greaterThanOrEqualTo(0));
        expect(c.right, lessThanOrEqualTo(1.0001));
      }
      for (var i = 0; i < cells.length; i++) {
        for (var j = i + 1; j < cells.length; j++) {
          final o = cells[i].intersect(cells[j]);
          expect(o.width <= 1e-9 || o.height <= 1e-9, isTrue);
        }
      }
    }
  });

  test('a single photo stays inside the limits', () {
    for (final r in [0.3, 0.75, 1.0, 1.5, 4.0, null]) {
      final box = chatPhotoBox(r, maxWidth: 260, maxHeight: 320);
      expect(box.width, lessThanOrEqualTo(260));
      expect(box.height, lessThanOrEqualTo(320));
    }
  });

  for (final doc in [false, true]) {
    testWidgets('a 10-item ${doc ? 'files list' : 'album'} fits at 360 dp, 3x',
        (tester) async {
      tester.view.physicalSize = const Size(1080, 2340);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final msgs = [
        for (var i = 0; i < 10; i++)
          _photo(i, doc: doc, caption: i == 9 ? 'caption' : ''),
      ];
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: AppTheme.light(),
            home: Scaffold(
              body: SingleChildScrollView(
                child: ChatAttachmentGroupBody(messages: msgs, mine: true),
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(tester.takeException(), isNull);
      final w = tester.getSize(find.byType(ChatAttachmentGroupBody)).width;
      expect(w, lessThanOrEqualTo(360 * 0.68 + 0.5));
    });
  }
}
