import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-28 (R-111): in every theme the like / comment / repost /
/// share / save icons of a post and of a brief are drawn in the theme's own
/// primary ink ([AppColorTokens.text]) — never the grey secondary tone. Only
/// the pressed states have their own colour (heart, repost, bookmark).
const _family = PostPractice(
  code: 'family_law',
  categoryCode: 'family_law',
  nameEn: 'Family Law',
  i18nKey: 'practice.family_law',
);

Post _post({PostPractice? practice, bool photo = false}) => Post(
      id: 'p',
      author: const PostAuthor(
        id: 'a1',
        username: 'saul',
        firstName: 'Saul',
        lastName: 'Goodman',
        verified: true,
      ),
      body: 'Know your rights',
      media: photo
          ? const [
              PostMedia(
                fileId: 'f',
                url: 'https://example.test/1.jpg',
                previewUrl: 'https://example.test/1_320.jpg',
                mediumUrl: 'https://example.test/1_1080.jpg',
                width: 1080,
                height: 1080,
              ),
            ]
          : const [],
      tags: const [],
      likeCount: 3,
      commentCount: 2,
      repostCount: 4,
      shareCount: 5,
      likedByMe: false,
      savedByMe: false,
      isMine: false,
      practice: practice,
      createdAt: DateTime(2026, 10, 20, 10),
    );

/// Practice names come from the server bundle: a missing key falls back like
/// production does.
class _Lenient extends StaticTranslatorEn {
  const _Lenient();

  @override
  String t(String key, [Map<String, String>? params]) =>
      seedEntries.containsKey(key) ? super.t(key, params) : key;
}

void main() {
  setUpAll(initializeDateFormatting);

  for (final id in AppThemeId.values) {
    for (final (name, post, detail) in [
      ('brief', _post(), false),
      ('open practice post', _post(practice: _family, photo: true), true),
    ]) {
      testWidgets('$name: action icons use the primary ink in ${id.name}',
          (t) async {
        t.view.physicalSize = const Size(400, 1000);
        t.view.devicePixelRatio = 1;
        addTearDown(t.view.reset);
        final theme = AppTheme.of(id);
        await t.pumpWidget(
          uxApp(
            Scaffold(
              body: SingleChildScrollView(
                child: PostCard(post: post, inDetail: detail),
              ),
            ),
            theme: theme,
            size: const Size(400, 1000),
            overrides: uxOverrides(
              social: FakeSocialRepository(),
              translator: const _Lenient(),
            ),
          ),
        );
        await t.pump(const Duration(seconds: 1));
        final colors = theme.extension<AppColorTokens>()!;
        final icons = find
            .descendant(
              of: find.byType(detail ? PostActionsBar : PostCard),
              matching: find.byType(AppIcon),
            )
            .evaluate()
            .map((e) => e.widget as AppIcon)
            .where(
              (i) => const {
                'comment',
                'repost',
                'share',
                'save',
              }.contains(_kindOf(i.icon)),
            )
            .toList();
        expect(icons, isNotEmpty);
        for (final i in icons) {
          expect(
            i.color,
            colors.text,
            reason: '${_kindOf(i.icon)} icon in ${id.name}',
          );
        }
        expect(colors.text, isNot(colors.textSecondary));
      });
    }
  }
}

String _kindOf(IconData? icon) {
  if (icon == AppIcons.modeCommentOutlined) return 'comment';
  if (icon == AppIcons.autoModeRounded) return 'repost';
  if (icon == AppIcons.sendOutlined) return 'share';
  if (icon == AppIcons.bookmarkBorderRounded) return 'save';
  return 'other';
}
