// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';

/// A practice name by its i18n key; a readable fallback while the key is
/// not in the local bundle yet.
String practiceLabel(Translator t, String key) {
  final v = t.t(key);
  if (v != key) return v;
  final last = key.split('.').last.replaceAll('_', ' ');
  return last.isEmpty ? key : last[0].toUpperCase() + last.substring(1);
}

/// docs/05 §7.3 / §6 attorney row: avatar, name, @username + check,
/// rating and reviews, first practices, states, "Подписаться".
class AttorneyTile extends ConsumerWidget {
  const AttorneyTile({required this.row, this.showFollow = true, super.key});

  final AttorneyRow row;
  final bool showFollow;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final me = ref.watch(currentUserIdProvider);
    final practices = row.practiceKeys.map((k) => practiceLabel(t, k));
    return AppPressable(
      onTap: () => context.push(AppRoutes.lawyer(row.username)),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenSide,
          vertical: AppSpacing.md,
        ),
        child: Row(
          children: [
            GoldRingAvatar(
              url: row.avatarUrl,
              initials: row.displayName.substring(0, 1).toUpperCase(),
              size: 52,
              ring: row.verified,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          row.displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.body.copyWith(
                            color: colors.text,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      if (row.verified) ...[
                        const SizedBox(width: AppSpacing.xs),
                        VerifiedCheck(label: t.t('post.verified'), size: 15),
                      ],
                    ],
                  ),
                  Text(
                    '@${row.username}',
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      AppIcon(
                        AppIcons.starRounded,
                        size: AppSizes.iconSm,
                        color: colors.gold,
                      ),
                      const SizedBox(width: 2),
                      Text(
                        row.ratingCount == 0
                            ? t.t('profile.rating.new')
                            : '${row.ratingAvg.toStringAsFixed(1)} · '
                                '${SocialFormat.plural(t, ref.watch(l10nFormatsProvider), 'profile.rating.count', row.ratingCount)}',
                        style: type.caption.copyWith(color: colors.text),
                      ),
                    ],
                  ),
                  if (practices.isNotEmpty || row.states.isNotEmpty)
                    Text(
                      [practices.join(', '), row.states.join(' · ')]
                          .where((s) => s.isNotEmpty)
                          .join('  ·  '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                ],
              ),
            ),
            if (showFollow && row.id != me) ...[
              const SizedBox(width: AppSpacing.sm),
              FollowButton(attorneyId: row.id, initial: row.isFollowing),
            ],
          ],
        ),
      ),
    );
  }
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
      onTap: () => context.push(AppRoutes.client(row.username)),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenSide,
          vertical: AppSpacing.md,
        ),
        child: Row(
          children: [
            GoldRingAvatar(
              url: row.avatarUrl,
              initials: row.displayName.substring(0, 1).toUpperCase(),
              size: 52,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          row.displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.body.copyWith(
                            color: colors.text,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      if (row.verified) ...[
                        const SizedBox(width: AppSpacing.xs),
                        VerifiedCheck(label: t.t('post.verified'), size: 15),
                      ],
                    ],
                  ),
                  Text(
                    '@${row.username}',
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${t.t('person.client')} · ${row.stateCode}',
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
    super.key,
  });

  final String attorneyId;
  final bool initial;

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
          height: expanded ? AppSizes.touchTarget : 36,
          width: expanded ? double.infinity : null,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: following ? Colors.transparent : colors.ctaBright,
            borderRadius: BorderRadius.circular(
              expanded ? AppRadii.field : AppRadii.pill,
            ),
            border: Border.all(
              color: following ? colors.border : colors.ctaBright,
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
                AppIcon(
                  following
                      ? AppIcons.checkRounded
                      : AppIcons.personAddAlt1Rounded,
                  size: AppSizes.iconSm,
                  color: following ? colors.text : colors.onCtaBright,
                ),
                const SizedBox(width: AppSpacing.xs),
                // Shrinks at 200% text scale instead of overflowing.
                Flexible(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      t.t(following ? 'follow.following' : 'follow.follow'),
                      maxLines: 1,
                      style: type.button.copyWith(
                        fontSize: 14,
                        color: following ? colors.text : colors.onCtaBright,
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
            AppSpacing.lg,
            AppSpacing.screenSide,
            AppSpacing.xs,
          ),
          child: Text(
            t.t('suggestions.title'),
            style: type.titleMedium.copyWith(color: colors.text),
          ),
        ),
        ...staggeredEntrance([
          for (final r in rows) AttorneyTile(key: ValueKey(r.id), row: r),
        ]),
      ],
    );
  }
}
