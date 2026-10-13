// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/trust/domain/trust_models.dart';
import 'package:lawbid/features/trust/presentation/trust_level_chip.dart';
import 'package:lawbid/features/trust/presentation/trust_level_sheet.dart';

/// A practice name by its i18n key; a readable fallback while the key is
/// not in the local bundle yet.
String practiceLabel(Translator t, String key) {
  final v = t.t(key);
  if (v != key) return v;
  final last = key.split('.').last.replaceAll('_', ' ');
  return last.isEmpty ? key : last[0].toUpperCase() + last.substring(1);
}

/// docs/05 §7.3 / §6 attorney row. Owner 2026-10-13: the name in full
/// (no cut-off) with the blue check right after it, the trust (Identity)
/// badge as a small circle on the avatar's bottom corner, then
/// "★ 4.7 · 112 reviews", then the practices ("+N" when they do not fit),
/// and a small outlined Follow on the side.
class AttorneyTile extends ConsumerWidget {
  const AttorneyTile({required this.row, this.showFollow = true, super.key});

  final AttorneyRow row;
  final bool showFollow;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final me = ref.watch(currentUserIdProvider);
    return AppPressable(
      onTap: () =>
          openProfile(context, ref, id: row.id, username: row.username),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenSide,
          vertical: AppSpacing.md,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PersonAvatar(row: row, size: 52),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  PersonNameBadges(row: row, maxLines: 2),
                  const SizedBox(height: 2),
                  PersonRatingLine(row: row, color: colors.textSecondary),
                  PersonPracticesLine(row: row),
                ],
              ),
            ),
            if (showFollow && row.id != me) ...[
              const SizedBox(width: AppSpacing.sm),
              // Capped so a long "Follow" (de, uk, …) can't squeeze the
              // name column; the label shrinks inside the pill instead.
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 120),
                child: FollowButton(
                  attorneyId: row.id,
                  initial: row.isFollowing,
                  outlined: true,
                  showIcon: false,
                  compact: true,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// The attorney's avatar and, on its bottom-end corner, the trust-level
/// badge: a small filled circle ringed in the background colour (like
/// Instagram's). Tapping the badge opens the level's sheet.
class PersonAvatar extends ConsumerWidget {
  const PersonAvatar({required this.row, required this.size, super.key});

  final AttorneyRow row;
  final double size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final avatar = GoldRingAvatar(
      url: row.avatarUrl,
      initials: avatarInitials(row.displayName),
      size: size,
      ring: row.verified,
    );
    if (row.trustLevel < 1) return avatar;
    final c = trustLevelColors(colors, row.trustLevel);
    final badge = size * 0.4;
    final label = t.t(TrustLevels.nameKey(row.trustLevel));
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          avatar,
          PositionedDirectional(
            end: -2,
            bottom: -2,
            child: Semantics(
              button: true,
              label: t.t('trust.chip.label', {'level': label}),
              excludeSemantics: true,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => showTrustLevelSheet(
                  context,
                  attorneyId: row.id,
                  level: row.trustLevel,
                ),
                child: Container(
                  width: badge,
                  height: badge,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: c.fg,
                    border: Border.all(color: colors.bg, width: 2),
                  ),
                  child: Center(
                    child: AppIcon(
                      trustLevelIcon(row.trustLevel),
                      size: badge * 0.55,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A name in full with the blue check glued to its last word: the word and
/// the check are one inline widget, so the check never wraps to a line of
/// its own.
InlineSpan nameWithCheck(
  String name, {
  required bool verified,
  required String checkLabel,
  required TextStyle style,
}) {
  if (!verified) return TextSpan(text: name);
  final cut = name.lastIndexOf(' ');
  final head = cut < 0 ? '' : name.substring(0, cut + 1);
  final last = cut < 0 ? name : name.substring(cut + 1);
  return TextSpan(
    children: [
      if (head.isNotEmpty) TextSpan(text: head),
      WidgetSpan(
        alignment: PlaceholderAlignment.middle,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(child: Text(last, style: style)),
            const SizedBox(width: AppSpacing.xs),
            VerifiedCheck(label: checkLabel, size: 15),
          ],
        ),
      ),
    ],
  );
}

/// The attorney's name in full, the blue check glued to its end.
class PersonNameBadges extends ConsumerWidget {
  const PersonNameBadges({
    required this.row,
    this.textAlign = TextAlign.start,
    this.maxLines,
    super.key,
  });

  final AttorneyRow row;
  final TextAlign textAlign;

  /// Null = the whole name, however long.
  final int? maxLines;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final style = type.body.copyWith(
      color: colors.text,
      fontWeight: FontWeight.w600,
    );
    if (maxLines != null && row.verified) {
      return _NameWithCheckFitted(
        name: row.displayName,
        checkLabel: t.t('post.verified'),
        style: style,
        maxLines: maxLines!,
        textAlign: textAlign,
      );
    }
    return Text.rich(
      nameWithCheck(
        row.displayName,
        verified: row.verified,
        checkLabel: t.t('post.verified'),
        style: style,
      ),
      textAlign: textAlign,
      maxLines: maxLines,
      overflow: maxLines == null ? TextOverflow.clip : TextOverflow.ellipsis,
      style: style,
    );
  }
}

/// The name cut with "…" so that the blue check always stays visible at the
/// end of the last allowed line (an ellipsis alone would swallow the check).
class _NameWithCheckFitted extends StatelessWidget {
  const _NameWithCheckFitted({
    required this.name,
    required this.checkLabel,
    required this.style,
    required this.maxLines,
    required this.textAlign,
  });

  final String name;
  final String checkLabel;
  final TextStyle style;
  final int maxLines;
  final TextAlign textAlign;

  static const double _checkSize = 15;
  static const double _gap = AppSpacing.xs;

  InlineSpan _span(String text, {required bool real, TextStyle? base}) =>
      TextSpan(
        style: base ?? style,
        children: [
          TextSpan(text: text),
          WidgetSpan(
            alignment: PlaceholderAlignment.middle,
            child: Padding(
              padding: const EdgeInsets.only(left: _gap),
              child: real
                  ? VerifiedCheck(label: checkLabel, size: _checkSize)
                  : const SizedBox(width: _checkSize + 8, height: _checkSize),
            ),
          ),
        ],
      );

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final dir = Directionality.of(context);
        final scaler = MediaQuery.textScalerOf(context);
        final locale = Localizations.maybeLocaleOf(context);
        final base = DefaultTextStyle.of(context).style.merge(style);
        bool fits(String text) {
          final tp = TextPainter(
            text: _span(text, real: false, base: base),
            textDirection: dir,
            textScaler: scaler,
            locale: locale,
            maxLines: maxLines,
            textAlign: textAlign,
          )..setPlaceholderDimensions(const [
              PlaceholderDimensions(
                size: Size(_checkSize + _gap + 8, _checkSize),
                alignment: PlaceholderAlignment.middle,
              ),
            ]);
          final ok = (tp..layout(maxWidth: box.maxWidth)).didExceedMaxLines;
          tp.dispose();
          return !ok;
        }

        var shown = name;
        if (!fits(name)) {
          var lo = 0;
          var hi = name.length;
          while (lo < hi) {
            final mid = (lo + hi + 1) ~/ 2;
            if (fits('${name.substring(0, mid).trimRight()}…')) {
              lo = mid;
            } else {
              hi = mid - 1;
            }
          }
          shown = '${name.substring(0, lo).trimRight()}…';
        }
        return Text.rich(
          _span(shown, real: true),
          style: style,
          textAlign: textAlign,
          maxLines: maxLines,
          overflow: TextOverflow.clip,
        );
      },
    );
  }
}

/// "★ 4.7 · 112 reviews" (grey), or "New" without reviews.
class PersonRatingLine extends ConsumerWidget {
  const PersonRatingLine({
    required this.row,
    required this.color,
    this.center = false,
    super.key,
  });

  final AttorneyRow row;
  final Color color;
  final bool center;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment:
          center ? MainAxisAlignment.center : MainAxisAlignment.start,
      children: [
        AppIcon(
          AppIcons.starRounded,
          size: AppSizes.iconSm,
          color: colors.gold,
        ),
        const SizedBox(width: 2),
        Flexible(
          child: Text(
            row.ratingCount == 0
                ? t.t('profile.rating.new')
                : '${row.ratingAvg.toStringAsFixed(1)} · '
                    '${SocialFormat.plural(t, ref.watch(l10nFormatsProvider), 'profile.rating.count', row.ratingCount)}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.caption.copyWith(color: color),
          ),
        ),
      ],
    );
  }
}

/// The practices, comma-separated, as many as fit [maxLines]; the rest as
/// "+N".
class PersonPracticesLine extends ConsumerWidget {
  const PersonPracticesLine({
    required this.row,
    this.maxLines = 1,
    this.textAlign = TextAlign.start,
    super.key,
  });

  final AttorneyRow row;
  final int maxLines;
  final TextAlign textAlign;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final labels = [for (final k in row.practiceKeys) practiceLabel(t, k)];
    if (labels.isEmpty) return const SizedBox.shrink();
    // The style the Text below really paints with, so the measurement
    // below matches its width.
    final style = DefaultTextStyle.of(context)
        .style
        .merge(type.caption.copyWith(color: colors.textSecondary));
    return LayoutBuilder(
      builder: (context, box) {
        final text = fitPracticeList(
          labels,
          style: style,
          maxWidth: box.maxWidth,
          maxLines: maxLines,
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
        );
        return Text(
          text,
          maxLines: maxLines,
          overflow: TextOverflow.ellipsis,
          textAlign: textAlign,
          style: style,
        );
      },
    );
  }
}

/// "A, B, C" cut to the longest head that fits [maxLines] lines of
/// [maxWidth], followed by " +N" for the practices left out. At least one
/// practice is always shown (ellipsised if it alone is too long).
String fitPracticeList(
  List<String> labels, {
  required TextStyle style,
  required double maxWidth,
  required int maxLines,
  required TextDirection textDirection,
  required TextScaler textScaler,
}) {
  String join(int k) => k >= labels.length
      ? labels.join(', ')
      : '${labels.take(k).join(', ')} +${labels.length - k}';
  bool fits(String s) {
    final p = TextPainter(
      text: TextSpan(text: s, style: style),
      textDirection: textDirection,
      textScaler: textScaler,
      maxLines: maxLines,
    )..layout(maxWidth: maxWidth);
    final ok = !p.didExceedMaxLines;
    p.dispose();
    return ok;
  }

  for (var k = labels.length; k > 1; k--) {
    final s = join(k);
    if (fits(s)) return s;
  }
  return join(1);
}

/// OQ-026: a client row in People search / followers — avatar, name,
/// @username, state; opens the client mini-profile.
class ClientTile extends ConsumerWidget {
  const ClientTile({required this.row, super.key});

  final ClientRow row;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return AppPressable(
      onTap: () => openProfile(
        context,
        ref,
        id: row.id,
        username: row.username,
        isClient: true,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenSide,
          vertical: AppSpacing.md,
        ),
        child: Row(
          children: [
            GoldRingAvatar(
              url: row.avatarUrl,
              initials: avatarInitials(row.displayName),
              size: 52,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text.rich(
                    nameWithCheck(
                      row.displayName,
                      verified: row.verified,
                      checkLabel: t.t('post.verified'),
                      style: type.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    style: type.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    '@${row.username}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${t.t('person.client')} · ${row.stateCode}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Either role's row (People search, followers).
class PersonTile extends StatelessWidget {
  const PersonTile({required this.row, this.showFollow = true, super.key});

  final PersonRow row;
  final bool showFollow;

  @override
  Widget build(BuildContext context) => row.attorney != null
      ? AttorneyTile(row: row.attorney!, showFollow: showFollow)
      : ClientTile(row: row.client!);
}

/// "Подписаться" ⇄ "Вы подписаны": a gold pill that morphs into an
/// outlined one; optimistic with rollback (docs/05 §6).
class FollowButton extends ConsumerWidget {
  const FollowButton({
    required this.attorneyId,
    required this.initial,
    this.expanded = false,
    this.outlined = false,
    this.showIcon = true,
    this.compact = false,
    super.key,
  });

  final String attorneyId;

  /// Shrink-wrapped small pill (search rows and tiles) instead of one that
  /// fills the width it is given.
  final bool compact;

  /// Without the person-add / check icon: just the label in the pill.
  final bool showIcon;
  final bool initial;

  /// Owner 2026-10-13: on post / reel cards Follow is a gold outline and
  /// Following a grey one, small, next to the author's name.
  final bool outlined;

  /// Full-width (profile) instead of a compact pill (lists).
  final bool expanded;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final following =
        ref.watch(followOverridesProvider.select((m) => m[attorneyId])) ??
            initial;
    final duration =
        context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    // Owner 2026-10-13: every Follow in a feed, card or list is the same
    // small outlined pill (Instagram-like): 28dp, 13sp, no icon.
    final small = outlined && !expanded;
    final compact = this.compact || small;
    final showIcon = this.showIcon && !small;
    return Semantics(
      button: true,
      toggled: following,
      label: t.t(following ? 'follow.following' : 'follow.follow'),
      excludeSemantics: true,
      child: AppPressable(
        onTap: () async {
          final error = await ref
              .read(socialActionsProvider)
              .setFollowing(attorneyId, !following);
          if (error != null && context.mounted) {
            showAppSnackBar(context, errorText(t, error));
          }
        },
        child: AnimatedContainer(
          duration: duration,
          curve: AppMotion.enterCurve,
          height: expanded
              ? AppSizes.touchTarget
              : (small ? 28 : (outlined ? 30 : 36)),
          width: expanded ? double.infinity : null,
          padding: EdgeInsets.symmetric(
            horizontal: small
                ? AppSpacing.sm + 2
                : (compact ? AppSpacing.md : AppSpacing.lg),
          ),
          alignment: compact ? null : Alignment.center,
          decoration: BoxDecoration(
            color:
                following || outlined ? Colors.transparent : colors.ctaBright,
            borderRadius: BorderRadius.circular(
              expanded ? AppRadii.field : AppRadii.pill,
            ),
            border: Border.all(
              color: following
                  ? colors.border
                  : (outlined ? colors.gold : colors.ctaBright),
            ),
          ),
          child: AnimatedSwitcher(
            duration: duration,
            transitionBuilder: (child, a) => FadeTransition(
              opacity: a,
              child: ScaleTransition(
                scale: Tween<double>(begin: 0.85, end: 1).animate(a),
                child: child,
              ),
            ),
            child: Row(
              key: ValueKey(following),
              mainAxisSize: MainAxisSize.min,
              children: [
                if (showIcon) ...[
                  AppIcon(
                    following
                        ? AppIcons.checkRounded
                        : AppIcons.personAddAlt1Rounded,
                    size: AppSizes.iconSm,
                    color: following
                        ? colors.textSecondary
                        : (outlined ? colors.gold : colors.onCtaBright),
                  ),
                  const SizedBox(width: AppSpacing.xs),
                ],
                // Shrinks at 200% text scale instead of overflowing.
                Flexible(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      t.t(following ? 'follow.following' : 'follow.follow'),
                      maxLines: 1,
                      style: type.button.copyWith(
                        fontSize: small ? 13 : 14,
                        color: following
                            ? (outlined ? colors.textSecondary : colors.text)
                            : (outlined ? colors.gold : colors.onCtaBright),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// §6.3 "Рекомендуемые адвокаты": used on the empty feed and before a
/// search is typed.
class SuggestedAttorneys extends ConsumerWidget {
  const SuggestedAttorneys({this.limit = 5, super.key});

  final int limit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(suggestionsProvider);
    final rows = value.value?.items.take(limit).toList() ?? const [];
    if (value.isLoading && rows.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(AppSpacing.screenSide),
        child: Column(
          children: [
            AppSkeleton(height: 52),
            SizedBox(height: AppSpacing.md),
            AppSkeleton(height: 52),
          ],
        ),
      );
    }
    if (rows.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.xs,
          ),
          child: Text(
            t.t('suggestions.title'),
            style: type.body.copyWith(
              color: colors.text,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        ...staggeredEntrance([
          for (final r in rows) AttorneyTile(key: ValueKey(r.id), row: r),
        ]),
      ],
    );
  }
}

/// Owner 2026-10-13: "Recommended" under the suggested rows — people as
/// tiles in a sideways row: avatar, name with check and Identity (one
/// unbreakable group), rating, practices and a small Follow. Takes the
/// suggestions the rows above did not show ([skip]).
class RecommendedAttorneys extends ConsumerWidget {
  const RecommendedAttorneys({this.skip = 5, this.limit = 10, super.key});

  final int skip;
  final int limit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final me = ref.watch(currentUserIdProvider);
    final rows = [
      for (final r in (ref.watch(suggestionsProvider).value?.items ??
              const <AttorneyRow>[])
          .skip(skip))
        if (r.id != me) r,
    ].take(limit).toList();
    if (rows.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.xs,
          ),
          child: Text(
            t.t('search.recommended'),
            style: type.body.copyWith(
              color: colors.text,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding:
              const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final r in rows) ...[
                RecommendedTile(key: ValueKey('rec-${r.id}'), row: r),
                const SizedBox(width: AppSpacing.sm),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

double _bodyLineHeight(BuildContext context) {
  final body = Theme.of(context).extension<AppTypographyTokens>()!.body;
  return MediaQuery.textScalerOf(context)
      .scale((body.fontSize ?? 16) * (body.height ?? 1.35));
}

/// One tile of [RecommendedAttorneys].
class RecommendedTile extends ConsumerWidget {
  const RecommendedTile({required this.row, super.key});

  final AttorneyRow row;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return SizedBox(
      width: 132,
      child: AppPressable(
        onTap: () =>
            openProfile(context, ref, id: row.id, username: row.username),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(color: colors.border),
          ),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.sm),
            child: Column(
              children: [
                PersonAvatar(row: row, size: 44),
                const SizedBox(height: AppSpacing.xs),
                // Room for two lines of name in every tile, so the rating
                // and Follow sit at the same height in all of them.
                SizedBox(
                  height: 2 * _bodyLineHeight(context),
                  child: Align(
                    alignment: Alignment.topCenter,
                    child: PersonNameBadges(
                      row: row,
                      textAlign: TextAlign.center,
                      maxLines: 2,
                    ),
                  ),
                ),
                const SizedBox(height: 2),
                PersonRatingLine(
                  row: row,
                  color: colors.textSecondary,
                  center: true,
                ),
                const SizedBox(height: AppSpacing.sm),
                FollowButton(
                  attorneyId: row.id,
                  initial: row.isFollowing,
                  outlined: true,
                  showIcon: false,
                  compact: true,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
