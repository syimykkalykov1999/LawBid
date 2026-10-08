import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/gestures.dart' show kDoubleTapTimeout;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/data/reels_repository.dart';
import 'package:lawbid/features/reels/domain/reel_cut.dart';
import 'package:lawbid/features/reels/presentation/reel_detail_screen.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/reels/presentation/reels_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_attachments_sheet.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_documents.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';
import '../social/social_fakes.dart';

/// Owner 2026-10-05: a reel is cut from a longer video with a chosen
/// cover; under it a wide button ("Смотреть" / "Читать") opens its inside
/// — text, up to 9 photos, up to 9 documents; posts carry documents too.

Post _reel({bool photos = true, bool docs = true}) {
  final base = fakePost('r1', withPhoto: photos);
  return Post(
    id: base.id,
    author: base.author,
    title: 'Know your rights at a traffic stop — the complete checklist',
    body: 'What to say, what not to say, and when to call a lawyer. '
        'Everything is in the documents below. #dui',
    media: base.media,
    tags: base.tags,
    likeCount: 3,
    commentCount: 1,
    likedByMe: false,
    savedByMe: false,
    isMine: false,
    createdAt: base.createdAt,
    video: const PostVideo(
      status: 'processing',
      trimStartMs: 20000,
      trimEndMs: 95000,
    ),
    attachments: docs
        ? const [
            PostAttachment(
              fileId: 'd1',
              fileName: 'Traffic stop checklist for drivers in Illinois '
                  '(2026 edition).pdf',
              mime: 'application/pdf',
              sizeBytes: 820000,
              url: 'https://example.test/d1',
            ),
            PostAttachment(
              fileId: 'd2',
              fileName: 'Notes.docx',
              mime:
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              sizeBytes: 12000,
              url: 'https://example.test/d2',
            ),
          ]
        : const [],
  );
}

class _Reels extends ReelsRepository {
  _Reels(this.items) : super(apiDio: Dio(), storageDio: Dio());

  final List<Post> items;

  @override
  Future<CursorPage<Post>> reels({String? cursor}) async =>
      CursorPage(items: items);
}

void main() {
  setUpAll(initializeDateFormatting);

  group('ReelCut (trim + cover)', () {
    test('starts with the first max seconds and the first frame', () {
      final c = ReelCut.initial(150000, 90000);
      expect([c.startMs, c.endMs, c.coverMs], [0, 90000, 0]);
      expect(c.trimmed, isTrue);
      expect(c.sourceSec, 150);
      final short = ReelCut.initial(42300, 90000);
      expect(short.trimmed, isFalse);
      expect(short.endMs, 42300);
      expect(short.sourceSec, 43);
    });

    test('never longer than the max: the other handle follows', () {
      final c = ReelCut.initial(150000, 90000);
      final moved = c.withRange(0, 140000, 90000);
      expect([moved.startMs, moved.endMs], [50000, 140000]);
      final back = moved.withRange(10000, 140000, 90000);
      expect([back.startMs, back.endMs], [10000, 100000]);
    });

    test('at least one second, inside the video; the cover stays inside', () {
      final c = ReelCut.initial(60000, 90000).withCover(50000);
      final tiny = c.withRange(30000, 30200, 90000);
      expect(tiny.lengthMs, ReelCut.minMs);
      expect(tiny.coverMs, inInclusiveRange(tiny.startMs, tiny.endMs));
      final out = c.withRange(-500, 99999, 90000);
      expect([out.startMs, out.endMs], [0, 60000]);
      expect(c.withCover(70000).coverMs, 60000);
      expect(formatCutTime(65400), '1:05');
    });
  });

  group('ReelClip (the player plays only the cut)', () {
    test('loops inside the range and counts progress within it', () {
      final clip = ReelClip.of(
        const PostVideo(status: 'ready', trimStartMs: 20000, trimEndMs: 95000),
        const Duration(seconds: 150),
      );
      expect(clip.trimmed, isTrue);
      expect(clip.outside(const Duration(seconds: 10)), isTrue);
      expect(clip.outside(const Duration(seconds: 95)), isTrue);
      expect(clip.outside(const Duration(seconds: 50)), isFalse);
      expect(clip.progress(const Duration(milliseconds: 57500)), 0.5);
    });

    test('no trim = the whole video; a bad range falls back to it', () {
      final whole = ReelClip.of(
        const PostVideo(status: 'ready'),
        const Duration(seconds: 30),
      );
      expect(
        [whole.start, whole.end],
        [Duration.zero, const Duration(seconds: 30)],
      );
      final bad = ReelClip.of(
        const PostVideo(status: 'ready', trimStartMs: 50000, trimEndMs: 40000),
        const Duration(seconds: 30),
      );
      expect(bad.start, Duration.zero);
      expect(bad.end, const Duration(seconds: 30));
    });
  });

  group('documents in the composer', () {
    late ProviderContainer container;
    late FakeSocialRepository repo;
    setUp(() {
      repo = FakeSocialRepository();
      container = ProviderContainer(
        overrides: [socialRepositoryProvider.overrideWithValue(repo)],
      );
    });
    tearDown(() => container.dispose());

    Uint8List bytes(int n) => Uint8List(n)..fillRange(0, n, 1);

    test('uploads PDF / Word / text, skips the rest, keeps the order',
        () async {
      final c = PostDocumentsController(container.read(socialActionsProvider));
      addTearDown(c.dispose);
      final skipped = c.addAll(
        [
          (bytes: bytes(100), name: 'Lease.pdf'),
          (bytes: bytes(100), name: 'Sheet.xlsx'),
          (bytes: bytes(11 * 1024 * 1024), name: 'Huge.pdf'),
          (bytes: bytes(100), name: 'notes.TXT'),
          (bytes: Uint8List(0), name: 'empty.docx'),
        ],
        eachMb: 10,
        totalMb: 30,
      );
      expect(skipped, 3);
      expect(c.ready, isFalse);
      await Future<void>.delayed(Duration.zero);
      expect(c.ready, isTrue);
      expect(repo.uploadedDocuments, ['application/pdf', 'text/plain']);
      expect(
        [for (final r in c.refs) '${r.fileId}:${r.fileName}'],
        ['doc-1:Lease.pdf', 'doc-2:notes.TXT'],
      );
    });

    test('at most 9 files and the admin total', () {
      final c = PostDocumentsController(container.read(socialActionsProvider));
      addTearDown(c.dispose);
      final skipped = c.addAll(
        [for (var i = 0; i < 11; i++) (bytes: bytes(10), name: '$i.pdf')],
        eachMb: 10,
        totalMb: 30,
      );
      expect(skipped, 2);
      expect(c.items, hasLength(kPostMaxDocuments));
      expect(c.full, isTrue);

      final d = PostDocumentsController(container.read(socialActionsProvider));
      addTearDown(d.dispose);
      expect(
        d.addAll(
          [
            for (var i = 0; i < 4; i++)
              (bytes: bytes(1024 * 1024), name: '$i.pdf'),
          ],
          eachMb: 10,
          totalMb: 3,
        ),
        1,
      );
    });

    test('a file name maps to the MIME the server accepts', () {
      expect(postDocumentMimeForName('a.PDF'), 'application/pdf');
      expect(postDocumentMimeForName('a.rtf'), 'application/rtf');
      expect(
        postDocumentMimeForName('a.odt'),
        'application/vnd.oasis.opendocument.text',
      );
      expect(postDocumentMimeForName('a.xls'), isNull);
      expect(postDocumentMimeForName('noext'), isNull);
    });
  });

  test('the button reads "Смотреть" with photos or files, else "Читать"', () {
    expect(reelMoreLabelKey(_reel()), 'reels.more.watch');
    expect(reelMoreLabelKey(_reel(photos: false)), 'reels.more.watch');
    expect(
      reelMoreLabelKey(_reel(photos: false, docs: false)),
      'reels.more.read',
    );
  });

  late List<Override> base;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    base = [
      sharedPreferencesProvider.overrideWithValue(prefs),
      referralOffOverride,
      promotionsOffOverride,
    ];
  });

  Future<void> pump(
    WidgetTester tester,
    Widget child, {
    Translator t = const StaticTranslatorRu(),
    TextDirection dir = TextDirection.ltr,
    List<Override> extra = const [],
    FakeSocialRepository? social,
  }) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        Directionality(textDirection: dir, child: child),
        theme: AppTheme.light(),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(
          translator: t,
          social: social,
          extra: [...base, ...extra],
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  testWidgets('a reel: back arrow top left, the wide button opens inside',
      (tester) async {
    await pump(
      tester,
      ReelsScreen(initial: [_reel()]),
      extra: [reelsRepositoryProvider.overrideWithValue(_Reels(const []))],
    );
    expect(find.byIcon(AppIcons.arrowBackRounded), findsOneWidget);
    final back = tester.getCenter(find.byIcon(AppIcons.arrowBackRounded));
    expect(back.dx, lessThan(80));
    expect(back.dy, lessThan(80));
    final button = find.byType(ReelMoreButton);
    expect(button, findsOneWidget);
    expect(find.text('Смотреть'), findsOneWidget);
    // Wide and low, pinned over the bottom.
    final box = tester.getRect(button);
    expect(box.width, greaterThan(narrowPhone.width * 0.8));
    expect(box.height, lessThanOrEqualTo(48));
    expect(box.bottom, greaterThan(narrowPhone.height - 80));

    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(find.byType(ReelDetailScreen), findsOneWidget);
    expect(find.text('Внутри рилса'), findsOneWidget);
    // Owner 2026-10-07: one «Посмотреть · N» button opens the files.
    final view = find.descendant(
      of: find.byType(PostAttachmentsButton),
      matching: find.byType(AppPressable),
    );
    await tester.ensureVisible(view);
    await tester.pumpAndSettle();
    await tester.tap(view);
    await tester.pumpAndSettle();
    expect(find.byType(PostDocumentsList), findsOneWidget);
    expect(find.text('Notes.docx'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'owner 2026-10-05: «Подписаться» next to the name, follows, blue check',
      (tester) async {
    final social = FakeSocialRepository();
    await pump(
      tester,
      ReelsScreen(initial: [_reel()]),
      social: social,
      extra: [reelsRepositoryProvider.overrideWithValue(_Reels(const []))],
    );
    final follow = find.byType(ReelFollowButton);
    expect(follow, findsOneWidget);
    expect(find.text('Подписаться'), findsOneWidget);
    // On the author's line, right after the name.
    final name = tester.getRect(find.text('Saul Goodman'));
    final pill = tester.getRect(follow);
    expect((pill.center.dy - name.center.dy).abs(), lessThan(12));
    expect(pill.left, greaterThan(name.right));
    // Attorneys wear the blue check, as on the feed card.
    final check = tester.widget<VerifiedCheck>(find.byType(VerifiedCheck));
    expect(check.gold, isFalse);

    await tester.tap(follow);
    await tester.pump(kDoubleTapTimeout);
    await tester.pump();
    expect(social.followCalls, [('att-1', true)]);
    expect(find.text('Вы подписаны'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('no «Подписаться» on your own reel', (tester) async {
    final r = _reel();
    final mine = Post(
      id: r.id,
      author: r.author,
      title: r.title,
      body: r.body,
      media: r.media,
      tags: r.tags,
      likeCount: r.likeCount,
      commentCount: r.commentCount,
      likedByMe: false,
      savedByMe: false,
      isMine: true,
      createdAt: r.createdAt,
      video: r.video,
    );
    await pump(
      tester,
      ReelsScreen(initial: [mine]),
      extra: [reelsRepositoryProvider.overrideWithValue(_Reels(const []))],
    );
    expect(find.byType(ReelFollowButton), findsNothing);
  });

  testWidgets('anything opened over the reel pauses it; back, it plays on',
      (tester) async {
    await pump(
      tester,
      ReelsScreen(initial: [_reel()]),
      extra: [reelsRepositoryProvider.overrideWithValue(_Reels(const []))],
    );
    bool paused() => tester.widget<ReelVideo>(find.byType(ReelVideo)).paused;
    expect(paused(), isFalse);
    // The "⋯" menu (a sheet on top of the reel).
    await tester.tap(
      find.bySemanticsLabel(const StaticTranslatorRu().t('post.menu')),
    );
    // Single taps wait out the double-tap-to-like window.
    await tester.pump(kDoubleTapTimeout);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('post-menu-report')), findsOneWidget);
    expect(
      tester
          .widget<ReelVideo>(find.byType(ReelVideo, skipOffstage: false))
          .paused,
      isTrue,
    );
    Navigator.of(tester.element(find.byKey(const ValueKey('post-menu-report'))))
        .pop();
    await tester.pumpAndSettle();
    expect(paused(), isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'Android: «Читать» and the actions sit above the system bar',
    (tester) async {
      useNarrowPhone(tester);
      const bar = 48.0;
      await tester.pumpWidget(
        uxApp(
          Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                padding: const EdgeInsets.only(top: 24, bottom: bar),
                viewPadding: const EdgeInsets.only(top: 24, bottom: bar),
              ),
              child: SystemNavBand(child: ReelsScreen(initial: [_reel()])),
            ),
          ),
          theme: AppTheme.light(),
          size: narrowPhone,
          disableAnimations: true,
          overrides: uxOverrides(
            translator: const StaticTranslatorRu(),
            extra: [
              ...base,
              reelsRepositoryProvider.overrideWithValue(_Reels(const [])),
            ],
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 300));
      final limit = narrowPhone.height - bar;
      expect(
        tester.getRect(find.byType(ReelMoreButton)).bottom,
        lessThanOrEqualTo(limit - 8),
      );
      expect(
        tester.getRect(find.byType(LinearProgressIndicator)).bottom,
        lessThanOrEqualTo(limit),
      );
      expect(tester.takeException(), isNull);
    },
    variant: TargetPlatformVariant.only(TargetPlatform.android),
  );

  final locales = <String, (Translator, TextDirection)>{
    'longest of all languages': (LongestTranslator(), TextDirection.ltr),
    'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };
  for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
    group('no overflow at 360 dp ($name)', () {
      testWidgets('the reel and its button', (tester) async {
        await pump(
          tester,
          ReelsScreen(initial: [_reel()]),
          t: t,
          dir: dir,
          extra: [reelsRepositoryProvider.overrideWithValue(_Reels(const []))],
        );
        expect(tester.takeException(), isNull);
      });

      testWidgets('the inside: text, photos, documents', (tester) async {
        await pump(tester, ReelDetailScreen(post: _reel()), t: t, dir: dir);
        await tester.drag(find.byType(ListView), const Offset(0, -600));
        await tester.pump();
        expect(tester.takeException(), isNull);
      });

      testWidgets('the documents editor', (tester) async {
        final container = ProviderContainer(
          overrides: [
            socialRepositoryProvider.overrideWithValue(FakeSocialRepository()),
          ],
        );
        addTearDown(container.dispose);
        final c = PostDocumentsController(container.read(socialActionsProvider))
          ..items.addAll([
            PostDocumentDraft(
              name: 'A very long contract name for the lease of an '
                  'apartment in Chicago.pdf',
              mime: 'application/pdf',
              bytes: Uint8List(2048),
            )..fileId = 'x',
            PostDocumentDraft(
              name: 'Notes.docx',
              mime: 'application/msword',
              bytes: Uint8List(10),
            )..error = StateError('x'),
            PostDocumentDraft(
              name: 'Uploading.txt',
              mime: 'text/plain',
              bytes: Uint8List(10),
            ),
          ]);
        addTearDown(c.dispose);
        await pump(
          tester,
          Scaffold(
            body: ListView(
              padding: const EdgeInsets.all(AppSpacing.screenSide),
              children: [PostDocumentsEditor(controller: c)],
            ),
          ),
          t: t,
          dir: dir,
        );
        expect(tester.takeException(), isNull);
      });
    });
  }
}
