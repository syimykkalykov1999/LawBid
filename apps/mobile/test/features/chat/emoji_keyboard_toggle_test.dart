// ignore_for_file: lines_longer_than_80_chars
import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:lawbid/features/stickers/application/stickers_providers.dart';
import 'package:lawbid/features/stickers/domain/sticker_models.dart';
import 'package:lawbid/features/stickers/presentation/sticker_widgets.dart';

import 'contact_info_test.dart';

/// Owner 2026-10-27 (Telegram / WhatsApp): the icon in the message field
/// swaps the keyboard and the Emoji · Stickers panel both ways, and a tap
/// on the field with the panel open brings the keyboard back.
void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  setUpAll(initializeDateFormatting);
  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('com.llfbandit.record/messages'),
      (_) async => null,
    );
  });

  Future<void> open(WidgetTester tester) => pumpContact(
        tester,
        contactTestApp(
          FakeContactChat(makeConv()),
          const ConversationScreen(conversationId: 'c1'),
          pushed: [],
          extra: [
            stickerLibraryProvider.overrideWith((_) async => StickerLibrary.empty),
            featuredStickerPacksProvider.overrideWith((_) async => const []),
          ],
        ),
      );

  EditableText field(WidgetTester tester) =>
      tester.widget<EditableText>(find.byType(EditableText).first);

  Finder icon() => find.descendant(
        of: find.byType(TextField),
        matching: find.byType(IconButton),
      );

  testWidgets('keyboard icon <-> panel, and a tap on the field', (tester) async {
    await open(tester);
    await tester.tap(find.byType(TextField));
    await tester.pump();
    expect(field(tester).focusNode.hasFocus, isTrue);
    expect(find.byType(StickerPanel), findsNothing);

    // Keyboard -> panel: the panel shows, the keyboard goes.
    await tester.tap(icon());
    await tester.pump();
    expect(find.byType(StickerPanel), findsOneWidget);
    expect(field(tester).focusNode.hasFocus, isFalse);

    // Panel -> keyboard: the panel hides, the field asks for the focus.
    await tester.tap(icon());
    await tester.pump();
    expect(find.byType(StickerPanel), findsNothing);
    expect(field(tester).focusNode.hasFocus, isTrue);

    // Panel open, a tap on the field: the panel hides, the keyboard opens.
    await tester.tap(icon());
    await tester.pump();
    expect(find.byType(StickerPanel), findsOneWidget);
    await tester.tap(find.byType(TextField));
    await tester.pump();
    expect(find.byType(StickerPanel), findsNothing);
    expect(field(tester).focusNode.hasFocus, isTrue);

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 2));
  });
}
