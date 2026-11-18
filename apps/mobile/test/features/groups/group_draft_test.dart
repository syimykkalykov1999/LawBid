import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/chat_text_drafts.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/group_conversation_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';
import 'fake_group_repository.dart';

/// Groups WhatsApp parity: the unsent text of a group is the 1:1 chat's
/// draft — it comes back when the group opens again, survives the app
/// being killed (it is on the device, per account) and waits while an old
/// message is edited.
const _en = StaticTranslatorEn();

void main() {
  setUpAll(initializeDateFormatting);

  late SharedPreferences prefs;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  Widget app(FakeGroupRepository repo, {bool open = true}) => ProviderScope(
        overrides: uxOverrides(
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            referralOffOverride,
            partnerOffOverride,
            groupRepositoryProvider.overrideWithValue(repo),
            currentUserIdProvider.overrideWithValue('me'),
            realtimeClientProvider.overrideWithValue(null),
          ],
        ),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: open
              ? const GroupConversationScreen(groupId: 'g1')
              : const SizedBox(),
        ),
      );

  Future<void> pump(WidgetTester tester, Widget w) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(w);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));
  }

  FakeGroupRepository repo() => FakeGroupRepository(
        const [],
        groupDetail(withPinned: false),
        [message('m1', body: 'My old note', mine: true)],
      );

  testWidgets('the unsent text survives the app being killed', (tester) async {
    await pump(tester, app(repo()));
    await tester.enterText(find.byType(TextField).last, 'Half a thought');
    await tester.pump(const Duration(milliseconds: 500));
    // On the device, under this account.
    expect(
      prefs.getString('chat.textDrafts.v1.me'),
      contains('Half a thought'),
    );

    // «Kill»: a brand new app (new ProviderScope) over the same storage.
    await tester.pumpWidget(const SizedBox());
    await pump(tester, app(repo()));
    expect(find.text('Half a thought'), findsOneWidget);

    // Sent → the draft goes.
    await tester.enterText(find.byType(TextField).last, '');
    await tester.pump(const Duration(milliseconds: 500));
    expect(prefs.getString('chat.textDrafts.v1.me'), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 6));
  });

  testWidgets('editing an old message keeps the draft and brings it back',
      (tester) async {
    await pump(tester, app(repo()));
    await tester.enterText(find.byType(TextField).last, 'Draft text');
    await tester.pump(const Duration(milliseconds: 500));

    await tester.longPress(find.text('My old note'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(_en.t('group.conv.edit')));
    await tester.pumpAndSettle();
    // The field holds the edited message; the stored draft stays.
    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller!.text,
      'My old note',
    );
    expect(prefs.getString('chat.textDrafts.v1.me'), contains('Draft text'));

    // Cancel the edit (the composer's close button): the draft is back.
    await tester.tap(find.bySemanticsLabel(_en.t('common.close')).last);
    await tester.pumpAndSettle();
    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller!.text,
      'Draft text',
    );
    await tester.pump(const Duration(milliseconds: 500));
    expect(prefs.getString('chat.textDrafts.v1.me'), contains('Draft text'));
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 6));
  });

  // Final pass 18.11 (FA4): a GIF from the keyboard while an old message
  // is edited goes without that text as its caption; the edit stays.
  testWidgets('a keyboard GIF during an edit leaves the edited text alone',
      (tester) async {
    await pump(tester, app(repo()));
    await tester.longPress(find.text('My old note'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(_en.t('group.conv.edit')));
    await tester.pumpAndSettle();
    final field = tester.widget<TextField>(find.byType(TextField).last);
    expect(field.controller!.text, 'My old note');

    field.contentInsertionConfiguration!.onContentInserted(
      KeyboardInsertedContent(
        mimeType: 'image/gif',
        uri: 'content://gboard/1',
        data: Uint8List.fromList(const [
          0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, //
          0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21,
          0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00,
          0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
          0x01, 0x00, 0x3b,
        ]),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller!.text,
      'My old note',
    );
    expect(find.text(_en.t('group.conv.editing')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 6));
  });

  test('a topic has a draft of its own', () {
    expect(groupDraftKey('g1', null), 'g1');
    expect(groupDraftKey('g1', 't1'), 'g1/t1');
    final c = ProviderContainer(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        currentUserIdProvider.overrideWithValue('me'),
      ],
    );
    addTearDown(c.dispose);
    c.read(chatTextDraftsProvider.notifier)
      ..set(groupDraftKey('g1', null), 'general')
      ..set(groupDraftKey('g1', 't1'), 'topic');
    expect(c.read(chatTextDraftsProvider)['g1'], 'general');
    expect(c.read(chatTextDraftsProvider)['g1/t1'], 'topic');
  });
}
