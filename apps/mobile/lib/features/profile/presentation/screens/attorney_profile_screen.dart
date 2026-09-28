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
      duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
      child: profile.when(
        skipLoadingOnReload: true,
        loading: () => const AttorneyProfileSkeleton(key: ValueKey('loading')),
        error: (error, _) {
          if (error is ApiException && error.code == ApiErrorCodes.notFound) {
            return ProfileUnavailableState(key: const ValueKey('404'), onBack: onBack);
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
/// landing screen of the `lawbid.app/lawyer/:username` deep link.
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
      appBar: AppTopBar(
        title: Text(t.t('profile.attorney.title')),
        leading: AppBackButton(semanticLabel: t.t('common.back'), onPressed: () => _leave(context)),
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
