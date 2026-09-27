import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';

/// `/splash` (docs/01_FOUNDATION_AUTH.md §10.2 A): runs the startup
/// sequence (token check, feature flags + legal docs + min version,
/// translations), then AppRouterGuard routes onward — welcome, the saved
/// onboarding step, or the feed.
///
/// States: loading (logo + progress), offline (stored session but no
/// network — Retry, never a silent logout), error (`GET /users/me` failed —
/// Retry). Empty/pagination don't apply to a splash.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key, this.autoStart = true});

  /// Tests render a fixed state without kicking off the real sequence.
  final bool autoStart;

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    if (widget.autoStart) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) unawaited(ref.read(appStartupProvider.notifier).run());
      });
    }
  }

  void _retry() {
    final startup = ref.read(appStartupProvider);
    if (startup == StartupStatus.ready) {
      unawaited(ref.read(currentUserControllerProvider.notifier).load());
    } else {
      unawaited(ref.read(appStartupProvider.notifier).run());
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final startup = ref.watch(appStartupProvider);
    final user = ref.watch(currentUserControllerProvider);

    final Widget body;
    if (startup == StartupStatus.offline || (user.status == CurrentUserStatus.failed && user.isOffline)) {
      body = AppOfflineState(
        key: const ValueKey('offline'),
        title: t.t('offline.title'),
        message: t.t('offline.message'),
        action: _RetryButton(label: t.t('error.retry'), onPressed: _retry),
      );
    } else if (user.status == CurrentUserStatus.failed) {
      body = AppErrorState(
        key: const ValueKey('error'),
        title: t.t('error.default.message'),
        message: errorText(t, user.error!),
        retryLabel: t.t('error.retry'),
        onRetry: _retry,
      );
    } else {
      body = _SplashLoading(key: const ValueKey('loading'), label: t.t('splash.loading'));
    }

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
          child: body,
        ),
      ),
    );
  }
}

class _SplashLoading extends StatelessWidget {
  const _SplashLoading({required this.label, super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      label: label,
      liveRegion: true,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppEntrance(
              scale: true,
              child: ExcludeSemantics(child: ScalesLogo(size: 160)),
            ),
            const SizedBox(height: AppSpacing.xxl),
            SizedBox(
              width: AppSizes.iconMd,
              height: AppSizes.iconMd,
              child: CircularProgressIndicator(strokeWidth: 2, color: colors.gold),
            ),
          ],
        ),
      ),
    );
  }
}

class _RetryButton extends StatelessWidget {
  const _RetryButton({required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: AppSizes.stateActionWidth,
      child: AppButton(
        label: label,
        icon: Icons.refresh_rounded,
        variant: AppButtonVariant.secondary,
        height: AppSizes.touchTarget,
        onPressed: onPressed,
      ),
    );
  }
}
