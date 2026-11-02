import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/contacts_sync/presentation/contacts_states.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_attachments_sheet.dart';
import 'package:lawbid/features/stories/application/story_publish_job.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/features/stories/presentation/story_publish_sheet.dart';
import 'package:lawbid/features/stories/presentation/story_viewer_sheets.dart';

import '../helpers/long_locale.dart';
import '../helpers/overflow_fixtures.dart';
import '../helpers/overflow_harness.dart';

/// Owner 2026-11-02, batch 5 of the screens no overflow test had covered:
/// the story publish panel (busy and failed), the contacts consent and
/// denied states, the post attachments button and sheet (photos and files
/// with long names). 360 dp, the longest text of every key, right-to-left,
/// ne, de, mr, ar, ru, at text scale 1 and 1.3; then the four themes.
class _FixedPublish extends StoryPublishJob {
  _FixedPublish(this._state);

  final StoryPublishState _state;

  @override
  StoryPublishState build() => _state;
}

typedef _Case = (
  Widget Function() build,
  Future<void> Function(WidgetTester) act,
  List<Override> extra,
);

const _media = [
  PostMedia(
    fileId: 'm1',
    url: 'https://example.invalid/1.jpg',
    previewUrl: 'https://example.invalid/1p.jpg',
    mediumUrl: 'https://example.invalid/1m.jpg',
  ),
  PostMedia(
    fileId: 'm2',
    url: 'https://example.invalid/2.jpg',
    previewUrl: 'https://example.invalid/2p.jpg',
    mediumUrl: 'https://example.invalid/2m.jpg',
  ),
];

const _docs = [
  PostAttachment(
    fileId: 'd1',
    fileName: '$longTitle.pdf',
    mime: 'application/pdf',
    sizeBytes: 123456789,
    url: 'https://example.invalid/d1.pdf',
  ),
  PostAttachment(
    fileId: 'd2',
    fileName: '$longTitle.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml'
        '.document',
    sizeBytes: 2048,
    url: 'https://example.invalid/d2.docx',
  ),
];

Story _story({required bool mine}) => Story(
      id: 's1',
      author: const StoryUser(id: 'u1', username: longTitle),
      kind: StoryKind.text,
      text: longText,
      overlays: const [],
      audience: StoryAudience.all,
      createdAt: DateTime(2026, 11, 2),
      expiresAt: DateTime(2026, 11, 3),
      viewedByMe: false,
      isMine: mine,
      viewCount: 1234567,
      canReply: true,
    );

void main() {
  final cases = <String, _Case>{
    'story publish (uploading)': (
      () => const Scaffold(body: StoryPublishPanel()),
      overflowShows(find.byType(AppButton)),
      [
        storyPublishJobProvider.overrideWith(
          () => _FixedPublish(
            const StoryPublishState(
              phase: StoryPublishPhase.uploading,
              progress: 0.4,
            ),
          ),
        ),
      ],
    ),
    'story publish (failed)': (
      () => const Scaffold(body: StoryPublishPanel()),
      overflowShows(find.byType(AppButton)),
      [
        storyPublishJobProvider.overrideWith(
          () => _FixedPublish(
            const StoryPublishState(
              phase: StoryPublishPhase.failed,
              error: 'x',
            ),
          ),
        ),
      ],
    ),
    'contacts consent': (
      () => const Scaffold(body: ContactsConsentView()),
      overflowShows(find.byType(AppButton)),
      const [],
    ),
    'contacts denied': (
      () => const Scaffold(body: ContactsDeniedView()),
      overflowShows(find.byType(AppButton)),
      const [],
    ),
    'story menu (mine)': (
      () => overflowOpener((c, r) => showStoryMenu(c, r, _story(mine: true))),
      overflowShows(find.byType(AppListRow), sheet: true),
      const [],
    ),
    'story menu (someone else)': (
      () => overflowOpener((c, r) => showStoryMenu(c, r, _story(mine: false))),
      overflowShows(find.byType(AppListRow), sheet: true),
      const [],
    ),
    'story report sheet': (
      () => overflowOpener(
            (c, r) => showStoryReportSheet(c, r, _story(mine: false)),
          ),
      overflowShows(find.byType(AppListRow), sheet: true),
      const [],
    ),
    'post attachments button': (
      () => const Scaffold(
            body: PostAttachmentsButton(media: _media, documents: _docs),
          ),
      overflowShows(find.byType(PostAttachmentsButton)),
      const [],
    ),
    'post attachments sheet': (
      () => overflowOpener(
            (c, _) => showPostAttachmentsSheet(
              c,
              media: _media,
              documents: _docs,
            ),
          ),
      overflowShows(find.byType(AppChip), sheet: true),
      const [],
    ),
  };

  // Every language at both scales, then the four themes in the longest text.
  final variants = <(String, Translator, TextDirection, double, AppThemeId)>[
    for (final scale in overflowScales)
      for (final MapEntry(key: name, value: (t, dir))
          in overflowLocales().entries)
        ('$name, x$scale', t, dir, scale, AppThemeId.day),
    for (final themeId in overflowThemes)
      (
        'themes (${themeId.name}, longest, x1.3)',
        LongestTranslator(),
        TextDirection.ltr,
        DeviceTextScale.shellMax,
        themeId,
      ),
  ];

  for (final (name, t, dir, scale, themeId) in variants) {
    group('batch 5: no overflow at 360 dp ($name)', () {
      for (final MapEntry(key: label, value: (build, act, extra))
          in cases.entries) {
        testWidgets(label, (tester) async {
          await pumpOverflowApp(
            tester,
            build(),
            t: t,
            dir: dir,
            scale: scale,
            theme: themeId,
            extra: extra,
            act: act,
          );
        });
      }
    });
  }
}
