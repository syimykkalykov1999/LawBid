// ignore_for_file: lines_longer_than_80_chars

import 'package:cupertino_interactive_keyboard/cupertino_interactive_keyboard.dart';
import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/platform/paste_files.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:lawbid/features/chat/presentation/media_preview_screen.dart';
import 'package:lawbid/features/chat/presentation/message_actions.dart';
import 'package:lawbid/shared/presentation/file_drop_zone.dart';
import 'package:lawbid/shared/presentation/keyboard_media.dart';

import 'contact_info_test.dart';

/// A 1×1 GIF, as Gboard hands one over.
final _gif = Uint8List.fromList([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, //
  0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

/// Rows 185 and 191: a GIF from the phone keyboard and a pasted screenshot
/// on the website open the media preview (the usual send road); on iPhone
/// the keyboard follows the finger and the field grows smoothly.
void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  setUpAll(initializeDateFormatting);
  final calls = <String>[];
  setUp(() {
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      ..setMockMethodCallHandler(
        const MethodChannel('com.llfbandit.record/messages'),
        (_) async => null,
      )
      ..setMockMethodCallHandler(
        const MethodChannel('cupertino_interactive_keyboard'),
        (call) async {
          calls.add(call.method);
          return true;
        },
      );
  });
  tearDown(() {
    FileDropZone.debugAssumeWeb = false;
    FileDropZone.debugListenForPaste = listenForPastedFiles;
  });

  Future<void> open(WidgetTester tester) => pumpContact(
        tester,
        contactTestApp(
          FakeContactChat(makeConv())
            ..textMessages.addAll([
              for (var i = 3; i >= 0; i--)
                ChatMessage(
                  id: 'm$i',
                  conversationId: 'c1',
                  kind: MessageKind.text,
                  body: 'message $i',
                  senderId: i.isEven ? 'u2' : 'me',
                  createdAt: DateTime(2026, 11).add(Duration(minutes: i)),
                ),
            ]),
          const ConversationScreen(conversationId: 'c1'),
          pushed: [],
        ),
      );

  Future<void> close(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  }

  test('the inserted picture is a file named by its type', () {
    final f = keyboardInsertedFile(
      KeyboardInsertedContent(
        mimeType: 'image/gif',
        uri: 'content://gboard/1',
        data: _gif,
      ),
    )!;
    expect(f.name, 'keyboard.gif');
    expect(f.mimeType, 'image/gif');
    expect(
      keyboardInsertedFile(
        const KeyboardInsertedContent(mimeType: 'image/png', uri: 'x'),
      ),
      isNull,
    );
  });

  testWidgets('a GIF from the keyboard opens the preview', (tester) async {
    await open(tester);
    final field = tester.widget<TextField>(find.byType(TextField));
    final config = field.contentInsertionConfiguration;
    expect(config, isNotNull, reason: 'the keyboard is told GIFs are taken');
    expect(config!.allowedMimeTypes, contains('image/gif'));

    config.onContentInserted(
      KeyboardInsertedContent(
        mimeType: 'image/gif',
        uri: 'content://gboard/1',
        data: _gif,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(MediaPreviewScreen), findsOneWidget);
    await close(tester);
  });

  testWidgets('a screenshot pasted on the website opens the preview',
      (tester) async {
    FileDropZone.debugAssumeWeb = true;
    void Function(List<XFile>)? paste;
    FileDropZone.debugListenForPaste = (onFiles, {required accept}) {
      paste = (f) {
        if (accept()) onFiles(f);
      };
      return () => paste = null;
    };
    await open(tester);
    expect(paste, isNotNull);
    paste!([XFile.fromData(_gif, name: 'image.gif', mimeType: 'image/gif')]);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(MediaPreviewScreen), findsOneWidget);
    await close(tester);
  });

  // Final pass 18.11 (FA4): a picture that arrives while an old message is
  // being edited (keyboard GIF, paste, drop, the paperclip) does not take
  // the edited text as its caption, and the edit stays as it was.
  testWidgets('a GIF while editing keeps the edited text out of the caption',
      (tester) async {
    await open(tester);
    final c = ProviderScope.containerOf(
      tester.element(find.byType(ConversationScreen)),
    );
    final mine = ChatMessage(
      id: 'm1',
      conversationId: 'c1',
      kind: MessageKind.text,
      body: 'message 1',
      senderId: 'me',
      createdAt: DateTime(2026, 11).add(const Duration(minutes: 1)),
    );
    c.read(chatComposeProvider('c1').notifier).edit(mine);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.controller!.text, 'message 1');

    field.contentInsertionConfiguration!.onContentInserted(
      KeyboardInsertedContent(
        mimeType: 'image/gif',
        uri: 'content://gboard/1',
        data: _gif,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    final preview =
        tester.widget<MediaPreviewScreen>(find.byType(MediaPreviewScreen));
    expect(preview.caption, isEmpty);
    expect(field.controller!.text, 'message 1');
    expect(c.read(chatComposeProvider('c1')).editing?.id, 'm1');
    await close(tester);
  });

  testWidgets('iPhone: the keyboard follows the finger, the bar rides on it',
      (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    try {
      await open(tester);
      expect(find.byType(CupertinoInteractiveKeyboard), findsOneWidget);
      expect(find.byType(CupertinoInputAccessory), findsOneWidget);
      final list = tester.widget<CustomScrollView>(
        find.byType(CustomScrollView).first,
      );
      expect(
        list.keyboardDismissBehavior,
        ScrollViewKeyboardDismissBehavior.manual,
        reason: 'UIKit moves the keyboard; Flutter must not drop it at once',
      );
      expect(calls, contains('initialize'));
      await close(tester);
    } finally {
      debugDefaultTargetPlatformOverride = null;
    }
  });

  testWidgets('Android: a drag hides the keyboard as before', (tester) async {
    await open(tester);
    expect(find.byType(CupertinoInteractiveKeyboard), findsNothing);
    expect(find.byType(CupertinoInputAccessory), findsNothing);
    final list = tester.widget<CustomScrollView>(
      find.byType(CustomScrollView).first,
    );
    expect(
      list.keyboardDismissBehavior,
      ScrollViewKeyboardDismissBehavior.onDrag,
    );
    await close(tester);
  });

  testWidgets('a new line grows the field smoothly', (tester) async {
    await open(tester);
    final box = find.ancestor(
      of: find.byType(TextField),
      matching: find.byType(AnimatedSize),
    );
    expect(box, findsOneWidget);
    final before = tester.getSize(box).height;
    await tester.enterText(find.byType(TextField), 'one\ntwo\nthree');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump(const Duration(milliseconds: 80));
    final during = tester.getSize(box).height;
    await tester.pump(const Duration(seconds: 1));
    final after = tester.getSize(box).height;
    expect(after, greaterThan(before));
    expect(during, greaterThan(before), reason: 'half way it is growing');
    expect(during, lessThan(after), reason: 'it grows, it does not jump');
    await close(tester);
  });
}
