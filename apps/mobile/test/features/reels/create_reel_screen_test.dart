import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/media/video_frames.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/data/reels_repository.dart';
import 'package:lawbid/features/reels/presentation/create_reel_screen.dart';
import 'package:lawbid/features/reels/presentation/reel_preview.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/tag_text_controller.dart';
import 'package:lawbid/features/uploads/application/upload_queue.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';
import '../social/social_fakes.dart';

/// Owner 2026-10-08: «Новый рилс» — the video pinned on top, no trimming
/// (over 90 s is refused), a cover row, one title/description field, a
/// grey button that says what is missing; «Опубликовать» closes at once
/// and the reel uploads in the feed's strip.

class FakeReelPreview implements ReelPreview {
  FakeReelPreview(this.durationMs, {this.child});

  @override
  final int durationMs;
  final Widget? child;
  final _changes = ValueNotifier<int>(0);
  bool _playing = false;
  bool disposed = false;
  final seeks = <int>[];

  @override
  Size get size => const Size(720, 1280);

  @override
  bool get playing => _playing;

  @override
  Listenable get changes => _changes;

  @override
  Widget view() => child ?? const ColoredBox(color: Colors.black);

  @override
  Future<void> play() async {
    _playing = true;
    _changes.value++;
  }

  @override
  Future<void> pause() async {
    _playing = false;
    _changes.value++;
  }

  @override
  Future<void> seekTo(int ms) async => seeks.add(ms);

  @override
  Future<void> dispose() async => disposed = true;
}

class FakeReels extends ReelsRepository {
  FakeReels() : super(apiDio: Dio(), storageDio: Dio());

  final created = <Map<String, Object?>>[];
  final uploaded = <String>[];
  bool failUpload = false;

  @override
  Future<ReelUpload> createUpload({
    required int sizeBytes,
    required int durationSec,
    String? title,
    int? trimStartMs,
    int? trimEndMs,
    int? coverTimeMs,
    String? coverFileId,
  }) async {
    created.add({
      'durationSec': durationSec,
      'title': title,
      'trimStartMs': trimStartMs,
      'coverTimeMs': coverTimeMs,
      'coverFileId': coverFileId,
    });
    return ReelUpload(
      videoAssetId: 'asset-${created.length}',
      tusEndpoint: 'https://tus.test',
      libraryId: 'lib',
      videoId: 'vid',
      signature: 's',
      expire: 0,
      maxDurationSec: 90,
    );
  }

  @override
  Future<void> upload(
    XFile file,
    ReelUpload u, {
    void Function(double)? onProgress,
    CancelToken? cancel,
  }) async {
    onProgress?.call(0.5);
    if (failUpload) throw StateError('offline');
    uploaded.add(u.videoAssetId);
    onProgress?.call(1);
  }

  @override
  Future<void> cancel(String videoAssetId) async {}
}

class FakeSocialWithPosts extends FakeSocialRepository {
  final drafts = <PostDraft>[];

  @override
  Future<Post> createPost(PostDraft draft) async {
    drafts.add(draft);
    return fakePost('new-${drafts.length}');
  }
}

/// A valid 1×1 PNG (a frame the phone made).
final _png = base64.decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk'
  'YAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
);

XFile fakeVideo() =>
    XFile.fromData(Uint8List(2048), name: 'clip.mp4', mimeType: 'video/mp4');

void main() {
  const ru = StaticTranslatorRu();
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

  test('a reel is refused over the limit, as the server rounds it', () {
    expect(reelTooLong(90000, 90), isFalse);
    expect(reelTooLong(90400, 90), isFalse);
    expect(reelTooLong(90600, 90), isTrue);
    expect(reelTooLong(95000, 90), isTrue);
  });

  test('the cover row spreads frames over the video', () {
    expect(coverFrameTimes(30000), hasLength(8));
    expect(coverFrameTimes(30000).first, 0);
    expect(coverFrameTimes(30000).last, 29500);
    expect(coverFrameTimes(0), isEmpty);
  });

  late ProviderContainer container;
  late Map<int, Uint8List> frames;

  Future<FakeReelPreview?> pump(
    WidgetTester tester, {
    int? durationMs,
    FakeReels? reels,
    FakeSocialWithPosts? social,
    String title = '',
  }) async {
    useNarrowPhone(tester);
    final preview = durationMs == null ? null : FakeReelPreview(durationMs);
    frames = {};
    container = ProviderContainer(
      overrides: uxOverrides(
        translator: ru,
        social: social ?? FakeSocialWithPosts(),
        extra: [
          ...base,
          reelsRepositoryProvider.overrideWithValue(reels ?? FakeReels()),
          reelPreviewLoaderProvider.overrideWithValue((_) async => preview),
          videoFramesProvider.overrideWithValue(
            (_, ms) async => frames[ms] = Uint8List.fromList(_png),
          ),
        ],
      ),
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: uxApp(
          Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => CreateReelScreen(
                        initialFile: durationMs == null ? null : fakeVideo(),
                        initialTitle: title,
                      ),
                    ),
                  ),
                  child: const Text('open'),
                ),
              ),
            ),
          ),
          theme: AppTheme.light(),
          size: narrowPhone,
          disableAnimations: true,
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    return preview;
  }

  bool? selected(WidgetTester tester, int i) => tester
      .widget<Semantics>(
        find
            .ancestor(
              of: find.byKey(ValueKey('reel-cover-frame-$i')),
              matching: find.byType(Semantics),
            )
            .first,
      )
      .properties
      .selected;

  AppButton publishButton(WidgetTester tester) =>
      tester.widget<AppButton>(find.byKey(const ValueKey('reel-publish')));

  testWidgets('no video yet: grey button says «choose a video»; no trim',
      (tester) async {
    await pump(tester);
    expect(find.byType(CreateReelScreen), findsOneWidget);
    expect(publishButton(tester).isEnabled, isFalse);
    // Owner 2026-10-08: the «Отрезок» step is gone.
    expect(find.text('Отрезок'), findsNothing);
    expect(find.byType(RangeSlider), findsNothing);
    expect(find.byType(Slider), findsNothing);
    await tester.tap(find.byKey(const ValueKey('reel-publish')));
    await tester.pump();
    expect(find.text(ru.t('reels.need.video')), findsOneWidget);
    await tester.pumpAndSettle(const Duration(seconds: 5));
  });

  testWidgets('a video over 90 s is refused with a clear message',
      (tester) async {
    final preview = await pump(tester, durationMs: 95000);
    expect(
      find.text(
        ru.t('reels.tooLong.max', {'max': '90', 'length': '1:35'}),
      ),
      findsOneWidget,
    );
    expect(preview!.disposed, isTrue);
    // Nothing was taken: no cover row, still «choose a video».
    expect(find.byKey(const ValueKey('reel-cover-frame-0')), findsNothing);
    expect(publishButton(tester).isEnabled, isFalse);
    await tester.pumpAndSettle(const Duration(seconds: 5));
  });

  testWidgets(
      'a video: pinned on top, cover row, one field, button waits for text',
      (tester) async {
    final preview = await pump(tester, durationMs: 30000);
    await tester.pumpAndSettle();
    expect(preview!.disposed, isFalse);
    // A row of frames (eight; the first is the cover) after «Из галереи».
    expect(frames, hasLength(8));
    expect(find.byKey(const ValueKey('reel-cover-frame-0')), findsOneWidget);
    expect(selected(tester, 0), isTrue);
    final gallery = tester.getRect(find.bySemanticsLabel('Из галереи').last);
    final first =
        tester.getRect(find.byKey(const ValueKey('reel-cover-frame-0')));
    expect(gallery.right, lessThan(first.left));
    expect(find.text('0:30'), findsOneWidget);
    // One field: title on top, a line, the description.
    final title = tester.getRect(find.byKey(const ValueKey('reel-title')));
    final text = tester.getRect(find.byKey(const ValueKey('reel-text')));
    expect(text.top, greaterThan(title.bottom - 1));
    expect((text.left - title.left).abs(), lessThan(1));
    expect(
      find.descendant(
        of: find.ancestor(
          of: find.byKey(const ValueKey('reel-title')),
          matching: find.byType(Column),
        ),
        matching: find.byType(Divider),
      ),
      findsWidgets,
    );
    final ctrl = tester
        .widget<TextField>(find.byKey(const ValueKey('reel-text')))
        .controller;
    expect(ctrl, isA<TagTextController>());
    // Place, comments, inside.
    expect(find.text(ru.t('reels.location')), findsOneWidget);
    expect(find.text(ru.t('reels.commentsOn')), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text(ru.t('reels.inside.title')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text(ru.t('reels.inside.title')), findsOneWidget);

    expect(publishButton(tester).isEnabled, isFalse);
    await tester.tap(find.byKey(const ValueKey('reel-publish')));
    await tester.pump();
    expect(find.text(ru.t('reels.need.text')), findsOneWidget);
    await tester.pumpAndSettle(const Duration(seconds: 5));

    // Scrolling the form keeps the video where it is.
    final before = tester.getRect(find.text('0:30'));
    await tester.drag(find.byType(ListView).first, const Offset(0, -300));
    await tester.pumpAndSettle();
    expect(tester.getRect(find.text('0:30')), before);

    await tester.drag(find.byType(Scrollable).first, const Offset(0, 3000));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('reel-title')), 'Права');
    await tester.pump();
    expect(publishButton(tester).isEnabled, isTrue);
  });

  testWidgets('picking a frame makes it the cover, large in the window',
      (tester) async {
    final preview = await pump(tester, durationMs: 30000);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('reel-cover-frame-3')));
    await tester.pumpAndSettle();
    final at = coverFrameTimes(30000)[3];
    expect(preview!.seeks, [at]);
    expect(selected(tester, 3), isTrue);
    expect(selected(tester, 0), isFalse);
    // The window shows the chosen frame, full size, over the paused video
    // (the row's tiles are downscaled copies).
    final images = tester.widgetList<Image>(find.byType(Image)).where(
          (i) =>
              i.image is MemoryImage &&
              identical((i.image as MemoryImage).bytes, frames[at]),
        );
    expect(images, hasLength(1));
  });

  testWidgets('«Опубликовать» closes at once; the reel uploads in the queue',
      (tester) async {
    final reels = FakeReels();
    final social = FakeSocialWithPosts();
    await pump(
      tester,
      durationMs: 42300,
      reels: reels,
      social: social,
      title: 'Права при остановке',
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('reel-cover-frame-2')));
    await tester.enterText(
      find.byKey(const ValueKey('reel-text')),
      'Коротко #права @saul',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('reel-publish')));
    await tester.pumpAndSettle();
    // The composer is gone at once.
    expect(find.byType(CreateReelScreen), findsNothing);
    final task = container.read(uploadQueueProvider).single;
    expect(task.video, isTrue);
    expect(task.thumbnail, isNotNull);
    expect(task.status, UploadStatus.done);
    expect(reels.created.single, {
      'durationSec': 42,
      'title': 'Права при остановке',
      'trimStartMs': null,
      'coverTimeMs': coverFrameTimes(42300)[2],
      'coverFileId': null,
    });
    expect(reels.uploaded, ['asset-1']);
    final draft = social.drafts.single;
    expect(draft.videoAssetId, 'asset-1');
    expect(draft.title, 'Права при остановке');
    expect(draft.body, 'Коротко #права @saul');
    expect(draft.commentsEnabled, isTrue);
    await tester.pump(UploadQueue.doneVisibleFor);
    await tester.pumpAndSettle();
  });

  testWidgets('an upload error keeps the draft; retry publishes it',
      (tester) async {
    final reels = FakeReels()..failUpload = true;
    final social = FakeSocialWithPosts();
    await pump(
      tester,
      durationMs: 20000,
      reels: reels,
      social: social,
      title: 'Права',
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('reel-publish')));
    await tester.pumpAndSettle();
    final task = container.read(uploadQueueProvider).single;
    expect(task.status, UploadStatus.failed);
    expect(social.drafts, isEmpty);
    reels.failUpload = false;
    container.read(uploadQueueProvider.notifier).retry(task.id);
    await tester.pumpAndSettle();
    expect(
      container.read(uploadQueueProvider).single.status,
      UploadStatus.done,
    );
    expect(social.drafts.single.title, 'Права');
    await tester.pump(UploadQueue.doneVisibleFor);
    await tester.pumpAndSettle();
  });
}
