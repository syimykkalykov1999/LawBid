import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/text/tidy_text.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/feed/application/news_flag.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart'
    show
        GoldRingAvatar,
        VerifiedCheck,
        splitPostBody,
        topicCategory,
        topicLabel;

/// How much a [PostTextCover] shows.
enum PostCoverDensity {
  /// Search grid (two per row): kind, practice chip, title, a few lines of
  /// text, the author.
  tile,

  /// Profile grid (three per row): the title and the practice glyph.
  compact,
}

/// Owner 2026-10-05: a post without photos or video in a grid is a text
/// cover in the style of the case "dossier" — a dark brand pattern (one
/// of [kBrandPatternVariants], picked by the post id), the title in serif
/// as the main element, the practice chip only when the author chose one,
/// the author's avatar and name at the bottom. No giant icon.
class PostTextCover extends ConsumerWidget {
  const PostTextCover({
    required this.post,
    this.density = PostCoverDensity.tile,
    this.kindLabel,
    super.key,
  });

  final Post post;
  final PostCoverDensity density;

  /// "Post" / "News" above the title (tile only).
  final String? kindLabel;

  /// The card title and the text under it, as on the feed card.
  static (String, String) titleAndRest(Post p) {
    final title = p.title?.trim();
    if (title != null && title.isNotEmpty) return (title, tidyText(p.body));
    return splitPostBody(p.body);
  }

  /// The post's practice (older posts: their practice hashtag), or null.
  static (String, String?)? practiceOf(WidgetRef ref, Post p) {
    final t = ref.watch(translatorProvider);
    final pr = p.practice;
    if (pr != null) {
      return (CaseFormat.practice(t, pr.i18nKey, pr.nameEn), pr.categoryCode);
    }
    for (final tag in p.tags) {
      final cat = topicCategory(tag);
      if (cat != null) return (topicLabel(tag), cat);
    }
    return null;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    // Small captions on a grid tile grow with the system text size only
    // so far; the title keeps the full scale.
    final scaler = MediaQuery.textScalerOf(context);
    final capScaler = scaler.clamp(maxScaleFactor: 1.3);
    final (title, rest) = titleAndRest(post);
    final practice = practiceOf(ref, post);
    final compact = density == PostCoverDensity.compact;
    final serif = type.titleMedium.fontFamily;
    // The cover is dark in both themes.
    const white = Colors.white;

    Widget kindRow() {
      final label = kindLabel;
      return Row(
        children: [
          if (label != null)
            Flexible(
              child: Text(
                label.toUpperCase(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.caption.copyWith(
                  color: colors.gold,
                  fontSize: 10.5,
                  letterSpacing: 1.4,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          if (post.isNews && ref.watch(newsEnabledProvider)) ...[
            const SizedBox(width: AppSpacing.xs),
            AppIcon(
              AppIcons.newspaperRounded,
              size: 14,
              color: colors.goldLight,
            ),
          ],
        ],
      );
    }

    Widget chip((String, String?) p) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
          decoration: BoxDecoration(
            color: colors.gold.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(color: colors.gold.withValues(alpha: 0.6)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppIcon(practiceGlyph(p.$2), size: 12, color: colors.goldLight),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  p.$1,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(
                    color: white,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        );

    Widget author() {
      final a = post.author;
      return Row(
        children: [
          GoldRingAvatar(
            url: a.avatarUrl,
            initials: a.initials,
            size: 22,
            ring: a.verified && !a.isClient,
          ),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              a.displayName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.caption.copyWith(
                color: white.withValues(alpha: 0.88),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          if (a.verified) ...[
            const SizedBox(width: 3),
            VerifiedCheck(
              label: ref.watch(translatorProvider).t('post.verified'),
              size: 12,
              gold: a.isClient,
            ),
          ],
        ],
      );
    }

    // The title is the cover: big when short, smaller as it grows; the
    // lines that fit decide how much text shows (no overflow at any
    // text scale or language).
    Widget body(BoxConstraints box) {
      final width = box.maxWidth.isFinite ? box.maxWidth : 170.0;
      final widthFactor = (width / (compact ? 110 : 160)).clamp(0.8, 1.25);
      final base = switch (title.characters.length) {
        <= 6 => compact ? 19.0 : 28.0,
        <= 14 => compact ? 17.0 : 24.0,
        <= 32 => compact ? 14.0 : 19.0,
        <= 64 => compact ? 12.5 : 16.5,
        _ => compact ? 11.5 : 15.0,
      };
      final size = base * widthFactor;
      final titleLine = scaler.scale(size) * 1.18;
      final h = box.maxHeight.isFinite ? box.maxHeight : 160.0;
      final quoteSize = scaler.scale(compact ? 22 : 30) * 0.8;
      final showQuote = h >= quoteSize + titleLine * 2;
      final quote = showQuote ? quoteSize : 0.0;
      final titleLines =
          math.max(1, math.min(compact ? 4 : 5, (h - quote) ~/ titleLine));
      final excerptLine = scaler.scale(12) * 1.35;
      final usedByTitle = math.min(
        titleLines * titleLine,
        // A short title takes fewer lines than allowed.
        (title.characters.length / math.max(1, width / (size * 0.55))).ceil() *
            titleLine,
      );
      final excerptLines = compact || rest.isEmpty
          ? 0
          : math.min(3, (h - quote - usedByTitle - 6) ~/ excerptLine);
      return ClipRect(
        child: OverflowBox(
          alignment: Alignment.bottomLeft,
          minHeight: 0,
          maxHeight: double.infinity,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (showQuote)
                Text(
                  '“',
                  maxLines: 1,
                  style: TextStyle(
                    fontFamily: serif,
                    fontSize: compact ? 22 : 30,
                    height: 0.8,
                    fontWeight: FontWeight.w700,
                    color: colors.gold.withValues(alpha: 0.85),
                  ),
                ),
              Text(
                title,
                maxLines: titleLines,
                overflow: TextOverflow.ellipsis,
                style: type.titleMedium.copyWith(
                  fontFamily: serif,
                  fontSize: size,
                  fontWeight: FontWeight.w700,
                  height: 1.18,
                  color: white,
                ),
              ),
              if (excerptLines >= 2) ...[
                const SizedBox(height: 6),
                Text(
                  rest,
                  maxLines: excerptLines,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(
                    fontSize: 12,
                    height: 1.35,
                    color: white.withValues(alpha: 0.72),
                  ),
                ),
              ],
            ],
          ),
        ),
      );
    }

    final pad = compact ? 8.0 : AppSpacing.md;
    return Stack(
      fit: StackFit.expand,
      children: [
        BrandPattern(seed: post.id),
        MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: capScaler),
          child: LayoutBuilder(
            builder: (context, box) {
              // What fits decides what shows: the title always, then the
              // author, the kind line and the practice chip.
              final h =
                  (box.maxHeight.isFinite ? box.maxHeight : 200) - pad * 2;
              final minTitle = scaler.scale(compact ? 13 : 17) * 1.2;
              final kindH = capScaler.scale(10.5) * 1.5;
              final chipH = 6 + 6 + capScaler.scale(11) * 1.4;
              final authorH = AppSpacing.sm * 2 +
                  1 +
                  math.max(22, capScaler.scale(12) * 1.5);
              var left = h - minTitle;
              final showAuthor = !compact && left >= authorH;
              if (showAuthor) left -= authorH;
              final showKind = !compact && left >= kindH;
              if (showKind) left -= kindH;
              final showChip = !compact && practice != null && left >= chipH;
              return Padding(
                padding: EdgeInsets.all(pad),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (compact)
                      Row(
                        children: [
                          if (practice != null)
                            AppIcon(
                              practiceGlyph(practice.$2),
                              size: 14,
                              color: colors.goldLight,
                            ),
                          const Spacer(),
                          if (post.isNews && ref.watch(newsEnabledProvider))
                            AppIcon(
                              AppIcons.newspaperRounded,
                              size: 14,
                              color: colors.goldLight,
                            ),
                        ],
                      ),
                    if (showKind) kindRow(),
                    if (showChip) ...[
                      const SizedBox(height: 6),
                      chip(practice),
                    ],
                    Expanded(
                      child: MediaQuery(
                        data:
                            MediaQuery.of(context).copyWith(textScaler: scaler),
                        child: LayoutBuilder(builder: (_, b) => body(b)),
                      ),
                    ),
                    if (showAuthor) ...[
                      const SizedBox(height: AppSpacing.sm),
                      Container(
                        height: 1,
                        color: colors.gold.withValues(alpha: 0.35),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      author(),
                    ],
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
