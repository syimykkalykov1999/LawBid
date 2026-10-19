// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/features/social/presentation/widgets/recommended_sheet.dart';
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
  const AttorneyTile({
    required this.row,
    this.showFollow = true,
    this.onOpened,
    super.key,
  });

  final AttorneyRow row;
  final bool showFollow;

  /// Owner 2026-10-15: told when the tile opens the profile (search).
  final VoidCallback? onOpened;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final me = ref.watch(currentUserIdProvider);
    return AppPressable(
      onTap: () {
        onOpened?.call();
        openProfile(context, ref, id: row.id, username: row.username);
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenSide,
          vertical: AppSpacing.md,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PersonAvatar(row: row, size: 40),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  PersonNameBadges(row: row, maxLines: 2),
                  const SizedBox(height: 2),
                  PersonRatingLine(row: row, color: colors.textSecondary),
                  PersonPracticesLine(row: row),
                  if (row.reason == 'contacts')
                    Text(
                      t.t('phoneContacts.reason'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
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
class IdentityAvatar extends ConsumerWidget {
  const IdentityAvatar({
    required this.id,
    required this.url,
    required this.initials,
    required this.size,
    required this.ring,
    required this.trustLevel,
    this.rejected = false,
    super.key,
  });

  /// Owner 2026-10-13: the attorney's verification was rejected — red.
  final bool rejected;

  final String id;
  final String? url;
  final String initials;
  final double size;
  final bool ring;
  final int trustLevel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final avatar = GoldRingAvatar(
      url: url,
      initials: initials,
      size: size,
      ring: ring,
    );
    return TrustAvatarBadge(
      id: id,
      size: size,
      trustLevel: trustLevel,
      rejected: rejected,
      child: avatar,
    );
  }
}

/// Any avatar of an attorney with the trust-level badge on its bottom-end
/// corner. Owner 2026-10-13: green Identity badge once the profile is
/// confirmed (identity level and above); grey while it is not; red when
/// rejected; nothing at level 0. Tapping it opens the level's sheet.
class TrustAvatarBadge extends ConsumerWidget {
  const TrustAvatarBadge({
    required this.id,
    required this.size,
    required this.trustLevel,
    required this.child,
    this.rejected = false,
    this.goldLabel,
    super.key,
  });

  /// Client profile: a gold badge (not tappable) with this semantic label
  /// instead of the attorney's trust level; [trustLevel] is ignored.
  final String? goldLabel;

  final String id;

  /// Outer diameter of [child] (the badge is a fraction of it).
  final double size;
  final int trustLevel;
  final bool rejected;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gold = goldLabel;
    if (gold == null && trustLevel < 1 && !rejected) return child;
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final c = rejected
        ? (
            fill: colors.dangerTint,
            fg: colors.dangerText,
            border: colors.dangerText
          )
        : trustLevelColors(colors, trustLevel);
    // Instagram-sized: 40% of the avatar, capped so a profile-size avatar
    // does not get a oversized badge.
    final badge = (size * 0.4).clamp(0.0, 24.0);
    final label = TrustLevels.nameKey(trustLevel);
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned.fill(child: child),
          PositionedDirectional(
            end: -2,
            bottom: -2,
            child: Semantics(
              button: gold == null,
              label: gold ?? t.t('trust.chip.label', {'level': t.t(label)}),
              excludeSemantics: true,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: gold != null
                    ? null
                    : () => showTrustLevelSheet(
                          context,
                          attorneyId: id,
                          level: trustLevel,
                        ),
                child: Container(
                  width: badge,
                  height: badge,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: gold != null ? colors.goldAccent : c.fg,
                    border: Border.all(color: colors.bg, width: 2),
                  ),
                  child: Center(
                    child: AppIcon(
                      rejected
                          ? AppIcons.closeRounded
                          : trustLevelIcon(trustLevel),
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

class PersonAvatar extends StatelessWidget {
  const PersonAvatar({required this.row, required this.size, super.key});

  final AttorneyRow row;
  final double size;

  @override
  Widget build(BuildContext context) => IdentityAvatar(
        id: row.id,
        url: row.avatarUrl,
        initials: avatarInitials(row.displayName),
        size: size,
        ring: row.verified,
        trustLevel: row.trustLevel,
        rejected: row.identityRejected,
      );
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
    this.gold = false,
  });

  /// Clients wear the gold check, attorneys the blue one.
  final bool gold;

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
                  ? VerifiedCheck(
                      label: checkLabel,
                      size: _checkSize,
                      gold: gold,
                    )
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
        // A name that needs only one line keeps the check on that line
        // (it is cut with "…" instead of letting the check drop to line 2).
        final plain = TextPainter(
          text: TextSpan(text: name, style: base),
          textDirection: dir,
          textScaler: scaler,
          locale: locale,
          maxLines: 1,
        )..layout(maxWidth: box.maxWidth);
        final oneLine = !plain.didExceedMaxLines;
        plain.dispose();
        final lines = oneLine ? 1 : maxLines;
        bool fits(String text) {
          final tp = TextPainter(
            text: _span(text, real: false, base: base),
            textDirection: dir,
            textScaler: scaler,
            locale: locale,
            maxLines: lines,
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
          maxLines: lines,
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
  const ClientTile({required this.row, this.onOpened, super.key});

  final ClientRow row;

  /// Owner 2026-10-15: told when the tile opens the profile (search).
  final VoidCallback? onOpened;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final me = ref.watch(currentUserIdProvider);
    return AppPressable(
      onTap: () {
        onOpened?.call();
        openProfile(
          context,
          ref,
          id: row.id,
          username: row.username,
          isClient: true,
        );
      },
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
              size: 40,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (row.verified)
                    _NameWithCheckFitted(
                      name: row.displayName,
                      checkLabel: t.t('post.verified'),
                      gold: true,
                      maxLines: 2,
                      textAlign: TextAlign.start,
                      style: type.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    )
                  else
                    Text(
                      row.displayName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  Text(
                    atHandle(row.username),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    // Owner 2026-10-18: no «Клиент» role label.
                    row.stateCode,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
            if (row.id != me) ...[
              const SizedBox(width: 12),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 120),
                child: FollowButton(
                  attorneyId: row.id,
                  initial: row.isFollowing,
                  outlined: true,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Either role's row (People search, followers).
class PersonTile extends StatelessWidget {
  const PersonTile({
    required this.row,
    this.showFollow = true,
    this.onOpened,
    super.key,
  });

  final PersonRow row;
  final bool showFollow;
  final VoidCallback? onOpened;

  @override
  Widget build(BuildContext context) => row.attorney != null
      ? AttorneyTile(
          row: row.attorney!,
          showFollow: showFollow,
          onOpened: onOpened,
        )
      : ClientTile(row: row.client!, onOpened: onOpened);
}

const Color _followBlue = Color(0xFF0095F6);

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
    final showIcon = this.showIcon && !small && !expanded;
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
          // Owner 2026-10-13: in a profile Follow and Message are the same
          // 32dp (Instagram), the hit area stays 48.
          height: expanded ? 32 : (small ? 28 : (outlined ? 30 : 36)),
          width: expanded ? double.infinity : null,
          padding: EdgeInsets.symmetric(
            horizontal: small
                ? AppSpacing.sm + 2
                : (compact ? AppSpacing.md : AppSpacing.lg),
          ),
          alignment: compact ? null : Alignment.center,
          decoration: BoxDecoration(
            // Owner 2026-10-13: like Instagram — Follow is a blue fill with
            // white text, Following a grey one with the normal text colour.
            color: following ? colors.surface : _followBlue,
            borderRadius: BorderRadius.circular(
              expanded ? AppRadii.field : AppRadii.pill,
            ),
            border: Border.all(
              color: following ? colors.border : _followBlue,
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
                    color: following ? colors.textSecondary : Colors.white,
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
                        // Owner 2026-10-16: the small pills (feed, player,
                        // lists) are 13sp like the player's; the profile
                        // button stays 14sp like Message.
                        fontSize: expanded ? 14 : 13,
                        color: following ? colors.text : Colors.white,
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
  const RecommendedAttorneys({this.skip = 0, this.limit = 10, super.key});

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
          child: Row(
            children: [
              Expanded(
                child: Text(
                  t.t('search.recommended'),
                  style: type.body.copyWith(
                    color: colors.text,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              // At the opposite edge (right in LTR, left in Arabic).
              GestureDetector(
                onTap: () => showRecommendedSheet(context),
                behavior: HitTestBehavior.opaque,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                  child: Text(
                    t.t('post.more'),
                    style: type.body.copyWith(
                      color: colors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        // Lazy: only the tiles on screen are built and laid out (ten tiles
        // at once cost ~15 ms on the first open of Search).
        SizedBox(
          height: RecommendedTile.height,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding:
                const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
            itemExtent: 132 + AppSpacing.sm,
            itemCount: rows.length,
            itemBuilder: (context, i) => Padding(
              padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
              child: RecommendedTile(
                key: ValueKey('rec-${rows[i].id}'),
                row: rows[i],
              ),
            ),
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
  const RecommendedTile({required this.row, this.width = 132, super.key});

  /// The tile's height, so a grid can give every cell the same one.
  static const double height = 164;

  final AttorneyRow row;
  final double width;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return SizedBox(
      width: width,
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
                // One line of name (with the check on it) in every tile, so the rating
                // and Follow sit at the same height in all of them.
                SizedBox(
                  height: _bodyLineHeight(context),
                  child: Align(
                    alignment: Alignment.topCenter,
                    child: PersonNameBadges(
                      row: row,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                    ),
                  ),
                ),
                const SizedBox(height: 2),
                PersonRatingLine(
                  row: row,
                  color: colors.textSecondary,
                  center: true,
                ),
                // Same height in every tile: one line, "+N" for the rest.
                SizedBox(
                  height: 18,
                  child: PersonPracticesLine(
                    row: row,
                    textAlign: TextAlign.center,
                  ),
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
