import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/reels/application/reel_publish_job.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/domain/reel_cut.dart';
import 'package:lawbid/features/social/presentation/screens/create_post_screen.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Records what the form asks of the reel job (no queue, no network).
class _Reels extends ReelPublishJob {
  final started = <String>[];
  final discarded = <String>[];
  final published = <String>[];
  int plainStarts = 0;

  @override
  ReelPublishState build() => const ReelPublishState();

  @override
  String? startDraft({
    required XFile file,
    required ReelCut cut,
    required Size previewSize,
    String? coverFileId,
  }) {
    final id = 'draft-${started.length + 1}';
    started.add(id);
    return id;
  }

  @override
  void discardDraft(String id) => discarded.add(id);

  @override
  Future<void> publishDraft(String id, ReelPublishRequest r) async =>
      published.add(id);

  @override
  Future<void> start(ReelPublishRequest r) async => plainStarts++;
}

/// R-396 (owner 2026-11-04, Instagram): the picked video starts uploading
/// at once; «Publish» only adds the caption; removing the video or leaving
/// the form drops the early upload.
void main() {
  late _Reels reels;

  Future<void> open(WidgetTester tester) async {
    reels = _Reels();
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        CreatePostScreen(debugVideo: XFile('picked.mp4')),
        theme: AppTheme.of(AppThemeId.values.first),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            reelsEnabledProvider.overrideWithValue(true),
            reelPublishJobProvider.overrideWith(() => reels),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
  }

  String text(WidgetTester tester, String key) => ProviderScope.containerOf(
        tester.element(find.byType(CreatePostScreen)),
      ).read(translatorProvider).t(key);

  testWidgets('picked: the draft starts once, not again on rebuilds',
      (tester) async {
    await open(tester);
    expect(reels.started, ['draft-1']);
    await tester.enterText(
      find.byKey(const ValueKey('post-body-field')),
      'Know your rights',
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(reels.started, ['draft-1']);
    expect(reels.discarded, isEmpty);
  });

  testWidgets('«Publish»: only the caption goes to the draft', (tester) async {
    await open(tester);
    await tester.tap(find.text(text(tester, 'post.create.publish')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(reels.published, ['draft-1']);
    expect(reels.plainStarts, 0);
    // The form is gone and the published draft is not dropped.
    await tester.pumpWidget(const SizedBox());
    expect(reels.discarded, isEmpty);
  });

  testWidgets('the video removed: the draft is dropped', (tester) async {
    await open(tester);
    final remove = find.text(text(tester, 'post.video.remove'));
    await tester.ensureVisible(remove);
    await tester.tap(remove);
    await tester.pump();
    expect(reels.discarded, ['draft-1']);
    await tester.pumpWidget(const SizedBox());
    expect(reels.discarded, ['draft-1'], reason: 'dropped once');
  });

  testWidgets('the form closed without «Publish»: the draft is dropped',
      (tester) async {
    await open(tester);
    await tester.pumpWidget(const SizedBox());
    expect(reels.discarded, ['draft-1']);
    expect(reels.published, isEmpty);
  });
}
