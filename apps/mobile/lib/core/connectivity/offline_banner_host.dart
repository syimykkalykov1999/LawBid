import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/connectivity/connectivity_status.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';

/// Whether [path] is inside the signed-in app (the bottom-nav shell and
/// the screens pushed over it) — where the global offline banner lives.
/// The pre-app flow (splash, welcome, auth, onboarding, legal) keeps its
/// own inline offline handling and its approved visuals (owner direction:
/// nothing visual changes there).
bool isInAppLocation(String path) {
  const roots = [
    AppRoutes.feed,
    AppRoutes.search,
    AppRoutes.mine,
    AppRoutes.profile,
    AppRoutes.create,
    // Public attorney profile / its deep link (docs/03 stage 3.9).
    '/lawyer',
  ];
  return roots.any((root) => path == root || path.startsWith('$root/'));
}

/// Global offline banner (docs/01 §8.3: "Offline (баннер сверху, показ
/// кэша)"): wraps the app's navigator and slides an
/// [AppConnectivityBanner] down from under the status bar while
/// [connectivityStatusProvider] reports offline; after an offline period
/// it briefly confirms "back online" ([AppMotion.restoredHold]) and
/// collapses. Screens underneath keep showing whatever they already loaded
/// (the "показ кэша" half) — each screen's own error/offline state only
/// appears when it has nothing to show.
///
/// [enabled] is false outside the signed-in app (see [isInAppLocation]).
class OfflineBannerHost extends ConsumerStatefulWidget {
  const OfflineBannerHost({
    required this.child,
    super.key,
    this.enabled = true,
  });

  final Widget child;
  final bool enabled;

  @override
  ConsumerState<OfflineBannerHost> createState() => _OfflineBannerHostState();
}

class _OfflineBannerHostState extends ConsumerState<OfflineBannerHost> {
  bool _showRestored = false;
  bool _checking = false;
  Timer? _restoredTimer;

  @override
  void dispose() {
    _restoredTimer?.cancel();
    super.dispose();
  }

  void _onStatusChanged(ConnectivityStatus? previous, ConnectivityStatus next) {
    if (previous != null && previous.isOffline && next.isOnline) {
      _restoredTimer?.cancel();
      setState(() => _showRestored = true);
      _restoredTimer = Timer(AppMotion.restoredHold, () {
        if (mounted) setState(() => _showRestored = false);
      });
    } else if (next.isOffline && _showRestored) {
      _restoredTimer?.cancel();
      setState(() => _showRestored = false);
    }
  }

  Future<void> _retry() async {
    if (_checking) return;
    setState(() => _checking = true);
    try {
      await ref.read(connectivityStatusProvider.notifier).retry();
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(connectivityStatusProvider, _onStatusChanged);
    final status = ref.watch(connectivityStatusProvider);
    final t = ref.watch(translatorProvider);
    // Theme extensions aren't resolved on MaterialApp.builder's very first
    // call; no banner until they are.
    final hasTheme = Theme.of(context).extension<AppColorTokens>() != null &&
        Theme.of(context).extension<AppTypographyTokens>() != null;

    // The tree shape never changes with [enabled]/theme — only the banner
    // does — so the navigator below is never re-created.
    Widget? banner;
    if (!widget.enabled || !hasTheme) {
      banner = null;
    } else if (status.isOffline) {
      banner = AppConnectivityBanner(
        key: const ValueKey('connectivity-offline'),
        message: status.offlineReason == OfflineReason.noNetwork
            ? t.t('connectivity.offline')
            : t.t('connectivity.unreachable'),
        actionLabel: t.t('error.retry'),
        onAction: _retry,
        busy: _checking,
        busyLabel: t.t('connectivity.checking'),
      );
    } else if (_showRestored) {
      banner = AppConnectivityBanner(
        key: const ValueKey('connectivity-restored'),
        message: t.t('connectivity.restored'),
        tone: AppConnectivityBannerTone.restored,
      );
    }

    return AppTopBannerSlot(banner: banner, child: widget.child);
  }
}

/// [OfflineBannerHost] that enables itself only while [router] is on an
/// in-app location ([isInAppLocation]). Used from `MaterialApp.builder`, so
/// it also covers in-app screens pushed on the root navigator (settings,
/// active devices, create) and not just the tab shell.
class RouterOfflineBannerHost extends StatelessWidget {
  const RouterOfflineBannerHost({
    required this.router,
    required this.child,
    super.key,
  });

  final GoRouter router;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: router.routerDelegate,
      builder: (context, child) => OfflineBannerHost(
        enabled: isInAppLocation(
          router.routerDelegate.currentConfiguration.uri.path,
        ),
        child: child!,
      ),
      child: child,
    );
  }
}
