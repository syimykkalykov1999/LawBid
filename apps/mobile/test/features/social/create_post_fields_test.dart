import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/features/social/domain/post_text.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/create_post_screen.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-19: one caption field, as in Instagram, for clients and
/// attorneys; photos (or a video, or files) alone can be published, an empty
/// post cannot. Posts go out without a title.
void main() {
  setUpAll(initializeDateFormatting);

  Future<void> open(
    WidgetTester tester, {
    int photos = 0,
    Post? editing,
  }) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        CreatePostScreen(debugPhotoCount: photos, editing: editing),
        theme: AppTheme.of(AppThemeId.values.first),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
  }

  final bodyField = find.byKey(const ValueKey('post-body-field'));

  bool publishEnabled(WidgetTester tester) =>
      tester.widget<AppButton>(find.byType(AppButton).last).isEnabled;

  testWidgets('one caption field, no title field', (tester) async {
    await open(tester);
    expect(find.byKey(const ValueKey('post-title-field')), findsNothing);
    expect(bodyField, findsOneWidget);
    expect(find.text('Title'), findsNothing);
    expect(find.text('Description'), findsNothing);
    expect(find.text('Write a caption for your post…'), findsOneWidget);
    expect(tester.widget<TextField>(bodyField).maxLines, greaterThan(1));
  });

  testWidgets('an empty post is refused, a caption is enough', (
    tester,
  ) async {
    await open(tester);
    expect(publishEnabled(tester), isFalse);
    await tester.enterText(bodyField, '   ');
    await tester.pump();
    expect(publishEnabled(tester), isFalse);
    await tester.enterText(bodyField, 'Only a caption');
    await tester.pump();
    expect(publishEnabled(tester), isTrue);
  });

  testWidgets('photos without any text can be published', (tester) async {
    await open(tester, photos: 2);
    expect(tester.widget<TextField>(bodyField).controller!.text, isEmpty);
    expect(publishEnabled(tester), isTrue);
  });

  testWidgets("editing a post with a title puts it on the caption's first line",
      (tester) async {
    await open(
      tester,
      editing: fakePost('p1').copyWith(title: 'Stored title', body: 'Text'),
    );
    expect(
      tester.widget<TextField>(bodyField).controller!.text,
      'Stored title\nText',
    );
  });

  testWidgets('an older post without a title keeps its text whole', (
    tester,
  ) async {
    await open(
      tester,
      editing: fakePost('p2').copyWith(body: 'First line\nThe rest'),
    );
    expect(
      tester.widget<TextField>(bodyField).controller!.text,
      'First line\nThe rest',
    );
  });

  testWidgets('a photo-only post shows no title, no text and no «more»', (
    tester,
  ) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: SingleChildScrollView(
            child: PostCard(
              post: fakePost('p3', withPhoto: true).copyWith(body: ''),
              feedHeight: 700,
            ),
          ),
        ),
        theme: AppTheme.of(AppThemeId.values.first),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            l10nFormatsProvider
                .overrideWithValue(L10nFormats(AppLanguage.fromCode('en'))),
          ],
        ),
      ),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.byType(FeedCaption), findsNothing);
    expect(find.textContaining('more'), findsNothing);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 10));
  });

  test('a video or files need no text; nothing at all is refused', () {
    expect(postHasContent(title: '', body: '', hasMedia: true), isTrue);
    expect(postHasContent(title: ' ', body: '\n', hasMedia: false), isFalse);
    expect(postHasContent(title: 'T', body: '', hasMedia: false), isTrue);
    expect(postTitleOf('  a\nb  '), 'a b');
  });
}
