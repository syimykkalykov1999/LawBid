import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/uploads/application/upload_queue.dart';
import 'package:lawbid/features/uploads/presentation/upload_strip.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';
import '../social/social_fakes.dart';

/// Owner 2026-10-08: posts and reels publish in the background; the feed
/// shows a strip — progress, «Опубликовано ✓» (tap opens the post) or
/// «Повторить» (the draft is kept).

/// A publish the test drives by hand.
class _Run {
  final calls = <UploadProgress>[];
  final _done = <Completer<Post>>[];

  Future<Post> call(Ref ref, UploadProgress progress) {
    calls.add(progress);
    final c = Completer<Post>();
    _done.add(c);
    return c.future;
  }

  void progress(double p) => calls.last(p);
  void finish(Post post) => _done.last.complete(post);
  void fail() => _done.last.completeError(StateError('offline'));
}

void main() {
  const ru = StaticTranslatorRu();

  group('UploadQueue', () {
    test('uploading → done; the bar never goes back', () async {
      final c = ProviderContainer();
      addTearDown(c.dispose);
      final run = _Run();
      final id = c.read(uploadQueueProvider.notifier).add(run.call);
      expect(c.read(uploadQueueProvider).single.status, UploadStatus.uploading);
      run
        ..progress(0.4)
        ..progress(0.2);
      expect(c.read(uploadQueueProvider).single.progress, 0.4);
      run.finish(fakePost('p1'));
      await Future<void>.delayed(Duration.zero);
      final t = c.read(uploadQueueProvider).single;
      expect(t.id, id);
      expect(t.status, UploadStatus.done);
      expect(t.progress, 1);
      expect(t.post?.id, 'p1');
    });

    test('an error keeps the draft; «Повторить» runs it again', () async {
      final c = ProviderContainer();
      addTearDown(c.dispose);
      final run = _Run();
      final id = c.read(uploadQueueProvider.notifier).add(run.call);
      run.fail();
      await Future<void>.delayed(Duration.zero);
      expect(c.read(uploadQueueProvider).single.status, UploadStatus.failed);
      c.read(uploadQueueProvider.notifier).retry(id);
      expect(run.calls, hasLength(2));
      expect(c.read(uploadQueueProvider).single.status, UploadStatus.uploading);
      run.finish(fakePost('p2'));
      await Future<void>.delayed(Duration.zero);
      expect(c.read(uploadQueueProvider).single.status, UploadStatus.done);
    });

    test('steps weigh into one bar', () {
      final seen = <double>[];
      StepProgress(seen.add, [1, 3])
        ..step(0, 1)
        ..step(1, 0.5);
      expect(seen, [0.25, 0.625]);
    });
  });

  group('UploadStrip', () {
    late ProviderContainer container;

    Future<void> pump(
      WidgetTester tester, {
      Brightness brightness = Brightness.light,
      void Function(BuildContext, Post)? onOpen,
      Translator t = ru,
    }) async {
      useNarrowPhone(tester);
      container = ProviderContainer(overrides: uxOverrides(translator: t));
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: uxApp(
            Scaffold(
              body: Column(
                children: [
                  UploadStrip(onOpen: onOpen),
                  const Expanded(child: Placeholder()),
                ],
              ),
            ),
            theme: brightness == Brightness.light
                ? AppTheme.light()
                : AppTheme.dark(),
            size: narrowPhone,
          ),
        ),
      );
    }

    testWidgets('nothing while the queue is empty', (tester) async {
      await pump(tester);
      expect(find.byType(UploadStripRow), findsNothing);
      expect(find.byType(LinearProgressIndicator), findsNothing);
    });

    testWidgets('uploading: thumbnail, percent and a gold bar', (tester) async {
      await pump(tester);
      final run = _Run();
      container.read(uploadQueueProvider.notifier).add(run.call, video: true);
      await tester.pump();
      run.progress(0.42);
      await tester.pumpAndSettle();
      expect(find.byType(UploadStripRow), findsOneWidget);
      expect(find.text('Загрузка 42%'), findsOneWidget);
      expect(find.byIcon(AppIcons.filmReelOutlined), findsOneWidget);
      final bar = tester.widget<LinearProgressIndicator>(
        find.byType(LinearProgressIndicator),
      );
      final colors = AppTheme.light().extension<AppColorTokens>()!;
      expect(bar.value, closeTo(0.42, 0.001));
      expect(bar.color, colors.gold);
      // No «Повторить» while it is going.
      expect(find.text('Повторить'), findsNothing);
      run.finish(fakePost('p1'));
      await tester.pumpAndSettle();
      await tester.pump(UploadQueue.doneVisibleFor);
      await tester.pumpAndSettle();
    });

    testWidgets('done: «Опубликовано ✓», a tap opens the post', (tester) async {
      Post? opened;
      await pump(tester, onOpen: (_, p) => opened = p);
      final run = _Run();
      container.read(uploadQueueProvider.notifier).add(run.call);
      await tester.pump();
      run.finish(fakePost('p7'));
      await tester.pumpAndSettle();
      expect(find.text('Опубликовано'), findsOneWidget);
      expect(find.byIcon(AppIcons.checkRounded), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsNothing);
      await tester.tap(find.byType(UploadStripRow));
      await tester.pumpAndSettle();
      expect(opened?.id, 'p7');
      // Opening it clears the strip.
      expect(find.byType(UploadStripRow), findsNothing);
    });

    testWidgets('done goes away by itself', (tester) async {
      await pump(tester);
      final run = _Run();
      container.read(uploadQueueProvider.notifier).add(run.call);
      await tester.pump();
      run.finish(fakePost('p1'));
      await tester.pumpAndSettle();
      expect(find.byType(UploadStripRow), findsOneWidget);
      await tester.pump(UploadQueue.doneVisibleFor);
      await tester.pumpAndSettle();
      expect(find.byType(UploadStripRow), findsNothing);
    });

    testWidgets('error: «Повторить» runs the same draft again', (tester) async {
      await pump(tester, brightness: Brightness.dark);
      final run = _Run();
      container.read(uploadQueueProvider.notifier).add(run.call);
      await tester.pump();
      run
        ..progress(0.6)
        ..fail();
      await tester.pumpAndSettle();
      expect(find.text('Не удалось опубликовать'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsNothing);
      expect(find.text('Повторить'), findsOneWidget);
      await tester.tap(find.text('Повторить'));
      await tester.pumpAndSettle();
      expect(run.calls, hasLength(2));
      expect(find.text('Загрузка 0%'), findsOneWidget);
      run.finish(fakePost('p1'));
      await tester.pumpAndSettle();
      expect(find.text('Опубликовано'), findsOneWidget);
      await tester.pump(UploadQueue.doneVisibleFor);
      await tester.pumpAndSettle();
    });

    testWidgets('error: × drops it', (tester) async {
      await pump(tester, t: const StaticTranslatorEn());
      final run = _Run();
      container.read(uploadQueueProvider.notifier).add(run.call);
      await tester.pump();
      run.fail();
      await tester.pumpAndSettle();
      expect(find.text("Couldn't publish"), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
      await tester.tap(find.bySemanticsLabel('Close'));
      await tester.pumpAndSettle();
      expect(find.byType(UploadStripRow), findsNothing);
      expect(container.read(uploadQueueProvider), isEmpty);
    });
  });
}
