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

/// Owner 2026-10-18: every post form has a one-line «Заголовок» above a
/// multi-line «Описание», both optional; photos (or a video, or files)
/// alone can be published, an empty post cannot.
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

  final titleField = find.byKey(const ValueKey('post-title-field'));
  final bodyField = find.byKey(const ValueKey('post-body-field'));

  bool publishEnabled(WidgetTester tester) =>
      tester.widget<AppButton>(find.byType(AppButton).last).isEnabled;

  testWidgets('two fields: a one-line title above a description', (
    tester,
  ) async {
    await open(tester);
    expect(titleField, findsOneWidget);
    expect(bodyField, findsOneWidget);
    expect(find.text('Title'), findsOneWidget);
    expect(find.text('Description'), findsOneWidget);
    final title = tester.widget<TextField>(titleField);
    expect(title.maxLines, 1);
    expect(title.maxLength, kPostTitleMaxChars);
    expect(tester.widget<TextField>(bodyField).maxLines, greaterThan(1));
    expect(
      tester.getTopLeft(titleField).dy,
      lessThan(tester.getTopLeft(bodyField).dy),
    );
    expect(find.textContaining('brief'), findsNothing);
  });

  testWidgets('an empty post is refused, a title or a description is enough', (
    tester,
  ) async {
    await open(tester);
    expect(publishEnabled(tester), isFalse);
    await tester.enterText(bodyField, '   ');
    await tester.pump();
    expect(publishEnabled(tester), isFalse);
    await tester.enterText(bodyField, 'Only a description');
    await tester.pump();
    expect(publishEnabled(tester), isTrue);
    await tester.enterText(bodyField, '');
    await tester.enterText(titleField, 'Only a title');
    await tester.pump();
    expect(publishEnabled(tester), isTrue);
  });

  testWidgets('photos without any text can be published', (tester) async {
    await open(tester, photos: 2);
    expect(tester.widget<TextField>(titleField).controller!.text, isEmpty);
    expect(tester.widget<TextField>(bodyField).controller!.text, isEmpty);
    expect(publishEnabled(tester), isTrue);
  });

  testWidgets('editing fills the title and the description', (tester) async {
    await open(
      tester,
      editing: fakePost('p1').copyWith(title: 'Stored title', body: 'Text'),
    );
    expect(
      tester.widget<TextField>(titleField).controller!.text,
      'Stored title',
    );
    expect(tester.widget<TextField>(bodyField).controller!.text, 'Text');
  });

  testWidgets('an older post without a title splits its text', (
    tester,
  ) async {
    await open(
      tester,
      editing: fakePost('p2').copyWith(body: 'First line\nThe rest'),
    );
    expect(tester.widget<TextField>(titleField).controller!.text, 'First line');
    expect(tester.widget<TextField>(bodyField).controller!.text, 'The rest');
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
