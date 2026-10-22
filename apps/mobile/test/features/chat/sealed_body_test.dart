import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart'
    show messagePreview;
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-22: a photo sent without a caption showed
/// `enc:v2.m1.oSYvQw…` under it and in the chat list. The sealed body of
/// an empty caption must never reach the screen.
const _sealedEmpty = 'enc:v2.m1.oSYvQwAbCdEfGhIj.k3Jx9QwErTyUiOpAsDfGhJ.';
const _sealedText = 'enc:v2.m1.oSYvQwAbCdEfGhIj.k3Jx9QwErTyUiOpAsDfGhJ.Zm9v';

Map<String, dynamic> _json({
  required String type,
  required String body,
  Map<String, dynamic>? attachment,
}) =>
    {
      'id': 'm1',
      'conversationId': 'c1',
      'senderId': 'me',
      'type': type,
      'body': body,
      'contactMasked': false,
      'createdAt': '2026-10-22T10:00:00.000Z',
      'revoked': false,
      'forwarded': false,
      'reactions': <dynamic>[],
      'pinned': false,
      if (attachment != null) 'attachment': attachment,
    };

Map<String, dynamic> _file({bool image = false, String? mime}) => {
      'fileId': 'f1',
      'name': image ? 'IMG_1.jpg' : 'Lease.pdf',
      'isImage': image,
      'mime': mime ?? (image ? 'image/jpeg' : 'application/pdf'),
      'sizeBytes': 1000,
      'url': null,
      'previewUrl': null,
    };

ChatMessage _map(Map<String, dynamic> j) =>
    ChatMappers.message(api.MessageDto.fromJson(j));

void main() {
  test('the shape of a sealed body is recognised; normal text is not', () {
    expect(isSealedChatBody(_sealedEmpty), isTrue);
    expect(isSealedChatBody(_sealedText), isTrue);
    expect(isSealedChatBody('hello'), isFalse);
    expect(isSealedChatBody('enc: my note'), isFalse);
    expect(isSealedChatBody(''), isFalse);
  });

  test('a media message with a sealed empty caption has no text', () {
    for (final a in [
      _file(image: true),
      _file(mime: 'video/mp4'),
      _file(),
    ]) {
      final m =
          _map(_json(type: 'attachment', body: _sealedEmpty, attachment: a));
      expect(m.body, isEmpty);
      expect(m.unreadable, isTrue);
    }
  });

  test('the chat list shows only the kind for a media message', () {
    const t = StaticTranslatorEn();
    final photo = _map(
      _json(
        type: 'attachment',
        body: _sealedEmpty,
        attachment: _file(image: true),
      ),
    );
    final video = _map(
      _json(
        type: 'attachment',
        body: _sealedEmpty,
        attachment: _file(mime: 'video/mp4'),
      ),
    );
    final file = _map(
      _json(type: 'attachment', body: _sealedEmpty, attachment: _file()),
    );
    expect(messagePreview(t, photo, me: 'me'), '📷 Photo');
    expect(messagePreview(t, video, me: 'me'), '🎥 Video');
    expect(messagePreview(t, file, me: 'me'), '📄 File');
    for (final m in [photo, video, file]) {
      expect(messagePreview(t, m, me: 'me'), isNot(contains('enc:')));
    }
  });

  test('a sealed text says it could not be decrypted, never the ciphertext',
      () {
    const t = StaticTranslatorEn();
    final m = _map(_json(type: 'text', body: _sealedText));
    expect(m.body, isEmpty);
    expect(messagePreview(t, m), t.t('chat.unreadable'));
  });

  testWidgets('a document with a sealed empty caption renders no text',
      (tester) async {
    final m = _map(
      _json(type: 'attachment', body: _sealedEmpty, attachment: _file()),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(body: AttachmentMessageBody(message: m, mine: true)),
        ),
      ),
    );
    await tester.pump();
    expect(find.textContaining('enc:', findRichText: true), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
