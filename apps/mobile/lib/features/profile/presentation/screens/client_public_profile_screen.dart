import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/blocks/presentation/block_actions.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart'
    show ReportTarget;
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart'
    show showReportSheet;
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/attorney_profile_view.dart'
    show ProfileUnavailableState;
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_handle_bar.dart';

/// `/client/:username` — a client's public mini-profile (owner decision
/// 2026-09-29, OQ-026): "@username" centered, avatar, name, state, member
/// since. No contacts, no cases: those stay behind an accepted bid.
class ClientPublicProfileScreen extends ConsumerWidget {
  const ClientPublicProfileScreen({required this.username, super.key});

  final String username;

  void _leave(BuildContext context) {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.feed);
    }
  }

  /// "⋯": Block / Unblock, Report (OQ-028).
  Future<void> _more(
    BuildContext context,
    WidgetRef ref,
    PublicClientProfile p,
  ) async {
    final t = ref.read(translatorProvider);
    await showAppBottomSheet<void>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            BlockListRow(
              userId: p.id,
              displayName: p.fullName.isEmpty ? '@${p.username}' : p.fullName,
              currentlyBlocked: p.isBlocked,
              onChanged: () =>
                  ref.invalidate(publicClientProfileProvider(username)),
            ),
            AppListRow(
              icon: Icons.flag_outlined,
              label: t.t('post.menu.report'),
              showChevron: false,
              onTap: () {
                Navigator.of(sheet).pop();
                showReportSheet(context, ref, ReportTarget.user, p.id);
              },
            ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final profile = ref.watch(publicClientProfileProvider(username));
    void retry() => ref.invalidate(publicClientProfileProvider(username));

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: ProfileHandleBar(
        handle: profile.value?.username ?? username,
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => _leave(context),
        ),
        actions: [
          if (profile.value case final p? when !p.isSelf)
            AppIconButton(
              plain: true,
              icon: Icon(Icons.more_horiz_rounded, color: colors.text),
              semanticLabel: t.t('chat.menu'),
              onPressed: () => _more(context, ref, p),
            ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: AnimatedSwitcher(
          duration:
              context.reduceMotion ? Duration.zero : AppMotion.stateChange,
          child: profile.when(
            skipLoadingOnReload: true,
            loading: () => const _Skeleton(key: ValueKey('loading')),
            error: (error, _) {
              if (error is ApiException &&
                  error.code == ApiErrorCodes.notFound) {
                return ProfileUnavailableState(
                  key: const ValueKey('404'),
                  onBack: () => _leave(context),
                );
              }
              if (isOfflineError(error)) {
                return AppOfflineState(
                  key: const ValueKey('offline'),
                  title: t.t('offline.title'),
                  message: t.t('offline.message'),
                  action: AppButton(
                    label: t.t('error.retry'),
                    icon: Icons.refresh_rounded,
                    variant: AppButtonVariant.secondary,
                    height: AppSizes.touchTarget,
                    onPressed: retry,
                  ),
                );
              }
              return AppErrorState(
                key: const ValueKey('error'),
                message: t.t('profile.error'),
                retryLabel: t.t('error.retry'),
                onRetry: retry,
              );
            },
            data: (p) => _Body(key: ValueKey('client-${p.id}'), profile: p),
          ),
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.profile, super.key});

  final PublicClientProfile profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final name =
        profile.fullName.isEmpty ? '@${profile.username}' : profile.fullName;
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.xxl,
      ),
      children: [
        Row(
          children: [
            ProfileAvatar(
              size: 88,
              url: profile.avatarUrl,
              initials: initialsOf(
                profile.firstName,
                profile.lastName,
                fallback: profile.username,
              ),
              semanticLabel: t.t('profile.avatar.label'),
            ),
            const SizedBox(width: AppSpacing.lg),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Semantics(
                          header: true,
                          child: Text(
                            name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: typography.titleMedium
                                .copyWith(color: colors.text),
                          ),
                        ),
                      ),
                      if (profile.verified) ...[
                        const SizedBox(width: AppSpacing.xs),
                        VerifiedBadge(
                            semanticLabel: t.t('profile.verified.label')),
                      ],
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    t.t('person.client'),
                    style: typography.caption
                        .copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
          ],
        ),
        if (profile.isBlocked || profile.hasBlockedMe) ...[
          const SizedBox(height: AppSpacing.md),
          _InfoRow(
            icon: Icons.block_flipped,
            text: t.t(profile.isBlocked ? 'block.byYou' : 'block.blockedYou'),
          ),
        ],
        const SizedBox(height: AppSpacing.lg),
        _InfoRow(
          icon: Icons.location_on_outlined,
          text: profile.state.name,
        ),
        const SizedBox(height: AppSpacing.sm),
        _InfoRow(
          icon: Icons.verified_user_outlined,
          text: t.t(
            'client.memberSince',
            {'date': f.date(profile.memberSince)},
          ),
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Row(
      children: [
        Icon(icon, size: AppSizes.iconSm, color: colors.goldDark),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            text,
            style: typography.body.copyWith(color: colors.text),
          ),
        ),
      ],
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton({super.key});

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.all(AppSpacing.screenSide),
        child: Row(
          children: [
            AppSkeleton(width: 88, height: 88, borderRadius: 44),
            SizedBox(width: AppSpacing.lg),
            Expanded(child: AppSkeleton(height: 24, borderRadius: 8)),
          ],
        ),
      );
}
