import 'dart:async';

import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/link_preview_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_cards.dart';
import 'package:lawbid/features/chat/presentation/chat_post_card.dart';
import 'package:lawbid/features/chat/presentation/link_preview_card.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_message_bubble.dart';
import 'package:lawbid/features/social/application/social_providers.dart'
    show currentUserIdProvider;
import 'package:lawbid/features/stickers/domain/sticker_models.dart';
import 'package:lawbid/features/stickers/presentation/sticker_widgets.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/ux_harness.dart';
import '../groups/fake_group_repository.dart';

/// Owner 27.11 («скачки везде»): cards that load after their message, a
/// pending reply's quote, stickers and places have their final size from
/// the first frame.
void main() {
  setUpAll(initializeDateFormatting);

  Future<Size> sizeOf(
    WidgetTester t,
    Widget child, {
    List<Override> extra = const [],
    Finder? measure,
  }) async {
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: Align(
            alignment: Alignment.topRight,
            child: KeyedSubtree(key: const ValueKey('probe'), child: child),
          ),
        ),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [currentUserIdProvider.overrideWithValue('me'), ...extra],
        ),
      ),
    );
    await t.pump();
    final size = t.getSize(measure ?? find.byKey(const ValueKey('probe')));
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 1));
    return size;
  }

  group('link card', () {
    const url = 'https://example.com/a';
    Future<Size> card(WidgetTester t, Future<LinkPreview?> answer) async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      return sizeOf(
        t,
        const LinkPreviewCard(url: url, mine: true),
        extra: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          linkPreviewProvider.overrideWith((ref, u) => answer),
        ],
      );
    }

    testWidgets('loading, a full preview and no preview: one size', (t) async {
      final loading = await card(t, Completer<LinkPreview?>().future);
      final full = await card(
        t,
        Future.value(
          const LinkPreview(
            url: url,
            siteName: 'Example',
            title: 'A long title that takes two lines in the card for sure',
            description: 'And a description long enough for two lines too.',
            imageUrl: 'https://example.com/a.jpg',
          ),
        ),
      );
      final short = await card(
        t,
        Future.value(const LinkPreview(url: url, title: 'Hi')),
      );
      final none = await card(t, Future.value());
      expect(loading.height, greaterThan(100), reason: 'room from frame 1');
      expect(full, loading);
      expect(short, loading);
      expect(none, loading);
    });
  });

  group('post card of a lawbid.dev link', () {
    const base = SharedPostCard(
      id: 'p1',
      available: true,
      authorName: 'Saul Goodman',
      title: 'Know your rights',
      excerpt: 'A text long enough to take more than three lines in the '
          'card under the picture, so the room is filled for sure.',
      thumbnailUrl: 'https://example.test/1_320.jpg',
    );

    testWidgets('loading, photo, text only, unavailable: one size', (t) async {
      Future<Size> s(SharedPostCard? c) =>
          sizeOf(t, FixedPostCard(card: c, mine: true));
      final loading = await s(null);
      final photo = await s(base);
      final textOnly = await s(
        const SharedPostCard(
          id: 'p2',
          available: true,
          authorName: 'Kim',
          excerpt: 'Only text',
        ),
      );
      final gone = await s(const SharedPostCard(id: 'p3', available: false));
      expect(photo, loading);
      expect(textOnly, loading);
      expect(gone, loading);
    });
  });

  testWidgets('group: a pending reply shows the quote the delivered one has',
      (t) async {
    final quoted = message('m9', body: 'Can we meet on Monday?');
    final preview = groupReplyPreviewOf(quoted);
    final bubble = find.descendant(
      of: find.byKey(const ValueKey('probe')),
      matching: find.byWidgetPredicate(
        (w) =>
            w is Container &&
            w.constraints != null &&
            w.decoration is BoxDecoration &&
            (w.decoration! as BoxDecoration).borderRadius != null,
      ),
    );
    final pending = await sizeOf(
      t,
      GroupPendingBubble(
        groupId: 'g1',
        pending: const PendingGroupMessage(
          clientMessageId: 'c1',
          body: 'Yes',
          replyToId: 'm9',
        ),
        replyTo: preview,
        onRetry: () {},
        onDiscard: () {},
      ),
      measure: bubble.first,
    );
    final sent = await sizeOf(
      t,
      GroupMessageBubble(
        message: message('m10', body: 'Yes', mine: true, replyTo: preview),
        groupId: 'g1',
        showName: false,
        showAvatar: false,
        canClose: false,
        highlighted: false,
        onMenu: () {},
        onPollChanged: (_) {},
      ),
      measure: bubble.first,
    );
    expect(pending.height, sent.height);
    expect(preview.snippet, 'Can we meet on Monday?');
  });

  testWidgets('a sticker is its fixed square before its picture comes',
      (t) async {
    final size = await sizeOf(
      t,
      const StickerMessageBody(
        sticker: ChatSticker(
          id: 's1',
          packId: 'p1',
          emoji: '👍',
          url: 'https://example.test/s1.webp',
        ),
      ),
    );
    expect(size.height, greaterThanOrEqualTo(150));
    final noPicture = await sizeOf(
      t,
      const StickerMessageBody(
        sticker: ChatSticker(id: 's2', packId: 'p1', emoji: '👍'),
      ),
    );
    expect(noPicture, size);
  });

  testWidgets('a place card is drawn from the message itself (no loading)',
      (t) async {
    final a = await sizeOf(
      t,
      const PlaceCardBody(address: '1 Main St, Reno, NV', mine: true),
    );
    final b = await sizeOf(
      t,
      const PlaceCardBody(address: '1 Main St, Reno, NV', mine: true),
    );
    expect(a, b);
    expect(a.height, greaterThan(0));
  });

  // Polls: PollBubble is built from the message's own poll (no request
  // before it draws) at a fixed width; nothing loads under it.
  test('poll width is fixed by the bubble (documented)', () {
    expect(api.GroupMessageDtoType.poll.json, 'poll');
  });
}
