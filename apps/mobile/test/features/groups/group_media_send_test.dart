import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';
import 'package:lawbid/features/chat/presentation/chat_post_card.dart';
import 'package:lawbid/features/groups/application/group_media_outbox.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_message_bubble.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/upload_queue_overrides.dart';
import '../../helpers/ux_harness.dart';
import '../social/social_fakes.dart';
import 'fake_group_repository.dart';

const _key = (groupId: 'g1', topicId: null);

Uint8List _png(int w, int h) =>
    Uint8List.fromList(img.encodePng(img.Image(width: w, height: h)));

Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 80));

/// Owner 26.11 (group chat on a Samsung S26): 51 photos picked and nothing
/// sent; a sent photo / video showed as «scaled_16832.jpg» with a clock; a
/// shared post showed as a bare link.
void main() {
  setUpAll(initializeDateFormatting);
  tearDown(ClientTuning.reset);
  const en = StaticTranslatorEn();

  group('1. one pick takes at most media.chat_pick_max', () {
    test('30 by default (owner), the admin may change it, no ceiling', () {
      expect(ClientTuning.chatPickMax, 30, reason: 'owner 26.11: 30');
      ClientTuning.apply(const {'media.chat_pick_max': '40'});
      expect(ClientTuning.chatPickMax, 40);
      ClientTuning.apply(const {'media.chat_pick_max': '1'});
      expect(ClientTuning.chatPickMax, 2, reason: 'the picker needs 2+');
      ClientTuning.apply(const {'media.chat_pick_max': '5000'});
      expect(ClientTuning.chatPickMax, 5000, reason: 'owner: no ceiling');
    });

    testWidgets('more than the max keeps the first ones and says why',
        (t) async {
      ClientTuning.apply(const {'media.chat_pick_max': '50'});
      late List<int> kept;
      await t.pumpWidget(
        uxApp(
          Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => kept = keepChatPickMax(
                  context,
                  en,
                  List<int>.generate(51, (i) => i),
                ),
                child: const Text('pick'),
              ),
            ),
          ),
          theme: AppTheme.light(),
          overrides: uxOverrides(),
        ),
      );
      await t.tap(find.text('pick'));
      await t.pump();
      expect(kept, List<int>.generate(50, (i) => i));
      expect(
        find.text(en.t('chat.attach.pickMax', {'max': '50'})),
        findsOneWidget,
      );
    });

    testWidgets('within the max: all kept, nothing said', (t) async {
      late List<int> kept;
      await t.pumpWidget(
        uxApp(
          Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => kept = keepChatPickMax(
                  context,
                  en,
                  List<int>.generate(30, (i) => i),
                ),
                child: const Text('pick'),
              ),
            ),
          ),
          theme: AppTheme.light(),
          overrides: uxOverrides(),
        ),
      );
      await t.tap(find.text('pick'));
      await t.pump();
      expect(kept, hasLength(30));
      expect(find.byType(SnackBar), findsNothing);
    });
  });

  group('2. a queued photo shows as itself at once', () {
    test('the pending bubble carries the picture, its shape and progress',
        () async {
      // The send never goes through: the bubble stays to be looked at.
      final repo = FakeGroupRepository()..failSend = true;
      final c = ProviderContainer(
        overrides: [
          groupRepositoryProvider.overrideWithValue(repo),
          realtimeClientProvider.overrideWithValue(null),
          ...uploadQueueOverrides(uploader: FakeStorageUploader()),
        ],
      );
      addTearDown(c.dispose);
      final sub = c.listen(groupThreadProvider(_key), (_, __) {});
      addTearDown(sub.close);
      await _settle();
      final photo = _png(40, 30);
      await c.read(groupThreadProvider(_key).notifier).queueAttachment(
            bytes: photo,
            name: 'scaled_16832.jpg',
            mime: 'image/png',
          );
      await _settle();
      final p = c.read(groupThreadProvider(_key)).pending.single;
      final a = p.attachment!;
      expect(a.isImage, isTrue);
      expect(a.localBytes, photo, reason: 'drawn from the phone, no download');
      expect((a.width, a.height), (40, 30));
      expect(a.sizeBytes, photo.length);
      await c.read(groupMediaOutboxProvider).drain();
    });

    testWidgets('the bubble is the 1:1 photo with its ring, not a file name',
        (t) async {
      var discarded = 0;
      await t.pumpWidget(
        uxApp(
          Scaffold(
            body: GroupPendingBubble(
              groupId: 'g1',
              pending: PendingGroupMessage(
                clientMessageId: 'c1',
                body: '',
                fileName: 'scaled_16832.jpg',
                attachment: ChatAttachment(
                  fileId: '',
                  name: 'scaled_16832.jpg',
                  isImage: true,
                  mime: 'image/png',
                  localBytes: _png(40, 30),
                  width: 40,
                  height: 30,
                  progress: 0.4,
                ),
              ),
              onRetry: () {},
              onDiscard: () => discarded++,
            ),
          ),
          theme: AppTheme.light(),
          overrides: uxOverrides(),
        ),
      );
      await t.pump();
      expect(find.byType(AttachmentMessageBody), findsOneWidget);
      expect(find.text('scaled_16832.jpg'), findsNothing);
      final ring = find.byType(CircularProgressIndicator);
      expect(ring, findsOneWidget);
      expect(t.widget<CircularProgressIndicator>(ring).value, 0.4);
      // Tapping the ring stops the upload (the queue's Delete).
      await t.tap(ring, warnIfMissed: false);
      expect(discarded, 1);
    });
  });

  group('3. a LawBid post link in a group is the post card', () {
    test('our post links are recognised, other links are not', () {
      expect(
        lawbidPostIdIn(
          'look https://lawbid.dev/post/p-42 !',
          host: 'lawbid.dev',
        ),
        'p-42',
      );
      expect(
        lawbidPostIdIn('https://lawbid.dev/lawyer/saul', host: 'lawbid.dev'),
        isNull,
      );
      expect(
        lawbidPostIdIn('https://example.com/post/p-42', host: 'lawbid.dev'),
        isNull,
      );
      expect(lawbidPostIdIn('no link', host: 'lawbid.dev'), isNull);
    });

    test('the card is built like the server builds it for a 1:1 chat', () {
      final card = sharedPostCardOf(fakePost('p1', withPhoto: true));
      expect(card.id, 'p1');
      expect(card.available, isTrue);
      expect(card.authorName, 'Saul Goodman');
      expect(card.authorVerified, isTrue);
      expect(card.excerpt, 'Know your rights #dui');
      expect(card.thumbnailUrl, 'https://example.test/1_320.jpg');
      expect(card.isVideo, isFalse);
    });

    testWidgets('a shared post link renders the 1:1 post card', (t) async {
      t.view.physicalSize = const Size(390, 844);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(
        uxApp(
          Scaffold(
            body: GroupMessageBubble(
              message: message('m1', body: 'https://lawbid.dev/post/p1'),
              groupId: 'g1',
              showName: false,
              showAvatar: false,
              canClose: false,
              highlighted: false,
              onMenu: () {},
              onPollChanged: (_) {},
              onReply: () {},
            ),
          ),
          theme: AppTheme.light(),
          disableAnimations: true,
          overrides: uxOverrides(
            extra: [
              currentUserIdProvider.overrideWithValue('me'),
              postProvider.overrideWith((ref, id) async => fakePost(id)),
            ],
          ),
        ),
      );
      await t.pump();
      await t.pump();
      expect(find.byType(FixedPostCard), findsOneWidget);
      expect(find.byKey(const ValueKey('chat-post-p1')), findsOneWidget);
      expect(
        find.textContaining('Goodman', findRichText: true),
        findsWidgets,
      );
    });

    testWidgets('a text without a link gets no card', (t) async {
      await t.pumpWidget(
        uxApp(
          Scaffold(
            body: GroupMessageBubble(
              message: message('m1', body: 'Hello group'),
              groupId: 'g1',
              showName: false,
              showAvatar: false,
              canClose: false,
              highlighted: false,
              onMenu: () {},
              onPollChanged: (_) {},
              onReply: () {},
            ),
          ),
          theme: AppTheme.light(),
          disableAnimations: true,
          overrides: uxOverrides(
            extra: [currentUserIdProvider.overrideWithValue('me')],
          ),
        ),
      );
      await t.pump();
      expect(find.byType(PostLinkCard), findsNothing);
    });
  });
}
