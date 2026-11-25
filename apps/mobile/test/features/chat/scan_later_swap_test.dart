import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';

/// M3 (owner 25.11, Slack / Telegram / WhatsApp): the message with a file
/// arrives while the server still checks the file. The recipient sees the
/// usual «processing» stand-in (no link yet), the photo swaps in when the
/// server sends the message again with `state: ready`, and a file the
/// antivirus refused turns into the quiet «removed» line for everyone.
Map<String, dynamic> _event(
  String state, {
  String? url,
  String name = 'IMG_1.jpg',
  String? mime = 'image/jpeg',
}) => {
  'message': {
    'id': 'm1',
    'conversationId': 'c1',
    'senderId': 'other',
    'type': 'attachment',
    'body': '',
    'contactMasked': false,
    'createdAt': '2026-11-25T10:00:00.000Z',
    'revoked': false,
    'forwarded': false,
    'reactions': <dynamic>[],
    'pinned': false,
    'attachment': {
      'fileId': 'f1',
      'name': name,
      'isImage': mime?.startsWith('image/') ?? false,
      'mime': mime,
      'sizeBytes': 1000,
      'url': url,
      'previewUrl': url,
      'width': 800,
      'height': 600,
      'state': state,
    },
  },
};

ChatMessage _of(Map<String, dynamic> e) => ChatMappers.fromEvent(e)!;

Widget _body(ChatMessage m) => ProviderScope(
  overrides: uxOverrides(),
  child: MaterialApp(
    theme: AppTheme.light(),
    home: Scaffold(
      body: Center(child: AttachmentMessageBody(message: m, mine: false)),
    ),
  ),
);

void main() {
  test('the state of the server reaches the model', () {
    expect(_of(_event('processing')).attachment!.removed, isFalse);
    expect(
      _of(_event('ready', url: 'https://f/1')).attachment!.removed,
      isFalse,
    );
    expect(_of(_event('removed', mime: null)).attachment!.removed, isTrue);
    // An older server sends no state: never «removed».
    final old = _event('ready', url: 'https://f/1');
    ((old['message'] as Map)['attachment'] as Map).remove('state');
    expect(_of(old).attachment!.removed, isFalse);
    expect(
      api.ChatMediaState.values,
      containsAll([
        api.ChatMediaState.processing,
        api.ChatMediaState.ready,
        api.ChatMediaState.removed,
      ]),
    );
  });

  testWidgets('processing → ready: the stand-in, then the photo swaps in', (
    tester,
  ) async {
    await tester.pumpWidget(_body(_of(_event('processing'))));
    await tester.pump();
    // No link for the recipient yet: the stand-in, no picture, no «removed».
    expect(find.byType(Image), findsNothing);
    expect(
      find.text('File removed: it failed the security check'),
      findsNothing,
    );

    // The server's `message:updated` once the file is clean.
    await tester.pumpWidget(
      _body(_of(_event('ready', url: 'https://cdn.test/f1.jpg'))),
    );
    await tester.pump();
    expect(find.byType(Image), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('processing → removed: the quiet line for everyone', (
    tester,
  ) async {
    await tester.pumpWidget(_body(_of(_event('processing'))));
    await tester.pump();
    await tester.pumpWidget(_body(_of(_event('removed', mime: null))));
    await tester.pump();
    expect(
      find.text('File removed: it failed the security check'),
      findsOneWidget,
    );
    expect(find.byType(Image), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a removed video or document is the same line', (tester) async {
    for (final (name, mime) in [
      ('clip.mp4', 'video/mp4'),
      ('Lease.pdf', 'application/pdf'),
    ]) {
      await tester.pumpWidget(
        _body(_of(_event('removed', name: name, mime: mime))),
      );
      await tester.pump();
      expect(
        find.text('File removed: it failed the security check'),
        findsOneWidget,
      );
    }
    expect(tester.takeException(), isNull);
  });
}
