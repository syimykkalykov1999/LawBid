import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/presentation/widgets/attorney_profile_view.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_handle_bar.dart';
import 'package:lawbid/features/stars/presentation/gift_widgets.dart'
    show GiftHeaderButton;
import 'package:lawbid/shared/presentation/guest_gate.dart';

/// Loads `GET /attorneys/:username` and renders every screen state:
/// skeleton, error + Retry, offline, "Profile unavailable" (404 — unknown,
/// suspended, or a client: docs/03 §4.2, §5) and the profile itself.
class AttorneyProfileBody extends ConsumerWidget {
  const AttorneyProfileBody({
    required this.username,
    super.key,
    this.needsVerification = false,
    this.onBack,
    this.initialTab = AttorneyProfileTab.posts,
  });

  final String username;
  final bool needsVerification;
  final VoidCallback? onBack;
  final AttorneyProfileTab initialTab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final profile = ref.watch(publicAttorneyProfileProvider(username));
    void retry() => ref.invalidate(publicAttorneyProfileProvider(username));

    return AnimatedSwitcher(
      // Owner 2026-10-19 («мигание»): loading, data and tab bodies
      // swap at once (Instagram), no cross-fade.
      duration: Duration.zero,
      child: profile.when(
        skipLoadingOnReload: true,
        loading: () => const AttorneyProfileSkeleton(key: ValueKey('loading')),
        error: (error, _) {
          if (error is ApiException && error.code == ApiErrorCodes.notFound) {
            return ProfileUnavailableState(
              key: const ValueKey('404'),
              onBack: onBack,
            );
          }
          if (isOfflineError(error)) {
            return AppOfflineState(
              key: const ValueKey('offline'),
              title: t.t('offline.title'),
              message: t.t('offline.message'),
              action: AppButton(
                label: t.t('error.retry'),
                icon: AppIcons.refreshRounded,
                variant: AppButtonVariant.secondary,
                height: AppSizes.touchTarget,
                onPressed: retry,
              ),
            );
          }
          // Owner 2026-10-22 (guest browsing): the profile is read with no
          // token. The API says 401 when the guest switch is off, 429 when
          // this address looked at too much — say that, with a way on.
          if (error is ApiException && error.guest) {
            if (error.code == ApiErrorCodes.unauthorized) {
              return GuestGateView(
                key: const ValueKey('guest'),
                message: t.t('guest.profile.signIn'),
              );
            }
            if (error.code == ApiErrorCodes.rateLimited) {
              return AppErrorState(
                key: const ValueKey('guest-later'),
                message: apiErrorText(t, error),
                retryLabel: t.t('error.retry'),
                onRetry: retry,
              );
            }
          }
          return AppErrorState(
            key: const ValueKey('error'),
            message: t.t('profile.error'),
            retryLabel: t.t('error.retry'),
            onRetry: retry,
          );
        },
        data: (p) => AttorneyProfileView(
          key: ValueKey('profile-${p.id}'),
          profile: p,
          needsVerification: needsVerification && p.isSelf,
          initialTab: initialTab,
          onRefresh: () async {
            ref.invalidate(publicAttorneyProfileProvider(username));
            try {
              await ref.read(publicAttorneyProfileProvider(username).future);
            } catch (_) {
              // The error state renders the failure.
            }
          },
        ),
      ),
    );
  }
}

/// `/lawyer/:username` — someone's public attorney profile, also the
/// landing screen of the `lawbid.dev/lawyer/:username` deep link.
class AttorneyProfileScreen extends ConsumerWidget {
  const AttorneyProfileScreen({
    required this.username,
    super.key,
    this.initialTab = AttorneyProfileTab.posts,
  });

  final String username;

  /// Tab to open on (a review notification opens Reviews).
  final AttorneyProfileTab initialTab;

  void _leave(BuildContext context) {
    // A deep link opens this with go(): nothing to pop → back to the feed.
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.feed);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      // Owner 2026-09-29: "@username" centered, like the own-profile tab.
      appBar: ProfileHandleBar(
        handle: username,
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => _leave(context),
        ),
        // Owner 2026-09-30: "⋯" (Block / Report) opposite the @username.
        actions: [
          // Owner 2026-10-21: their gifts behind an icon up here.
          if (ref.watch(publicAttorneyProfileProvider(username)).value
              case final p? when !(p.isBlocked || p.hasBlockedMe))
            GiftHeaderButton(userId: p.id, isMe: p.isSelf),
          if (ref.watch(publicAttorneyProfileProvider(username)).value
              case final p? when !p.isSelf)
            AppIconButton(
              icon: AppIcon(AppIcons.moreHorizRounded, color: colors.text),
              semanticLabel: t.t('chat.menu'),
              onPressed: () => showAttorneyMoreSheet(context, ref, p),
            ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: AttorneyProfileBody(
          username: username,
          initialTab: initialTab,
          onBack: () => _leave(context),
        ),
      ),
    );
  }
}
