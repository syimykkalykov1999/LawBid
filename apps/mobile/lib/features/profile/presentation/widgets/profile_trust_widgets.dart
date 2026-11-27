import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:material_ui/material_ui.dart';

/// One thing a complete attorney profile has. «О себе» (bio) is not one:
/// it is optional (owner 26.11), so it never counts toward the percent and
/// is never the «Дальше:» suggestion.
enum ProfilePart { photo, practices, languages, firm }

/// The parts [p] is still missing, in the order they are asked for.
List<ProfilePart> missingParts(PublicAttorneyProfile p) => [
      if ((p.avatarUrl ?? '').isEmpty) ProfilePart.photo,
      if (p.practices.isEmpty) ProfilePart.practices,
      if (p.languages.isEmpty) ProfilePart.languages,
      if (p.firms.isEmpty && (p.firmName ?? '').trim().isEmpty)
        ProfilePart.firm,
    ];

/// Row 112 (LinkedIn «Profile strength», Upwork «% complete», Thumbtack
/// checklist): on the attorney's own profile, how full it is and the next
/// thing to add (tap = the screen that adds it). Gone at 100 %.
class ProfileCompletenessCard extends ConsumerWidget {
  const ProfileCompletenessCard({required this.profile, super.key});

  final PublicAttorneyProfile profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final missing = missingParts(profile);
    if (missing.isEmpty) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final total = ProfilePart.values.length;
    final done = total - missing.length;
    final percent = (done * 100 / total).round();
    final next = missing.first;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: AppCard(
        key: const ValueKey('profile-completeness'),
        padding: const EdgeInsets.all(AppSpacing.md),
        onTap: () => context.push(
          next == ProfilePart.practices
              ? AppRoutes.practices
              : AppRoutes.profileEdit,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              t.t('profile.complete.title', {'percent': '$percent'}),
              style: typography.body.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadii.pill),
              child: LinearProgressIndicator(
                value: done / total,
                minHeight: AppSpacing.xs,
                color: colors.gold,
                backgroundColor: colors.border,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: Text(
                    t.t('profile.complete.next', {
                      'item': t.t('profile.complete.${next.name}'),
                    }),
                    style: typography.bodySmall.copyWith(
                      color: colors.textSecondary,
                    ),
                  ),
                ),
                AppIcon(
                  AppIcons.chevronRightRounded,
                  size: AppSizes.iconSm,
                  color: colors.textSecondary,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Row 112 (Airbnb listing «Reserve» bar, Thumbtack «Request estimate»):
/// «Message» and «Book» at the bottom of someone else's attorney profile,
/// shown once the header's buttons have scrolled away. Slides in (no
/// motion with Reduce Motion).
class ProfileStickyCta extends StatelessWidget {
  const ProfileStickyCta({
    required this.visible,
    required this.onMessage,
    required this.onBook,
    this.messageLabel,
    this.bookLabel,
    super.key,
  });

  final bool visible;
  final String? messageLabel;
  final VoidCallback onMessage;
  final String? bookLabel;
  final VoidCallback onBook;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final reduce = context.reduceMotion;
    final message = messageLabel;
    final book = bookLabel;
    // Hidden = not built (screen readers and finders see one Message).
    if (!visible) return const SizedBox.shrink();
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: reduce ? 0 : 1, end: 0),
      duration: reduce ? Duration.zero : AppMotion.toastEnter,
      curve: Curves.easeOutCubic,
      builder: (context, dy, child) =>
          FractionalTranslation(translation: Offset(0, dy), child: child),
      child: DecoratedBox(
        key: const ValueKey('profile-sticky-cta'),
        decoration: BoxDecoration(
          color: colors.surface,
          border: Border(top: BorderSide(color: colors.border)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              AppSpacing.sm,
              AppSpacing.screenSide,
              AppSpacing.sm,
            ),
            child: Row(
              children: [
                if (message != null)
                  Expanded(
                    child: AppButton(
                      key: const ValueKey('profile-sticky-message'),
                      label: message,
                      icon: AppIcons.chatBubbleOutlineRounded,
                      height: AppSizes.touchTarget,
                      onPressed: onMessage,
                    ),
                  ),
                if (message != null && book != null)
                  const SizedBox(width: AppSpacing.sm),
                if (book != null)
                  Expanded(
                    child: AppButton(
                      key: const ValueKey('profile-sticky-book'),
                      label: book,
                      icon: AppIcons.eventAvailableRounded,
                      variant: message == null
                          ? AppButtonVariant.primary
                          : AppButtonVariant.secondary,
                      height: AppSizes.touchTarget,
                      onPressed: onBook,
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
