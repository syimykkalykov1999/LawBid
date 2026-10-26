import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

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
    '/client',
  ];
  return roots.any((root) => path == root || path.startsWith('$root/'));
}

/// Former global offline banner host.
///
/// Owner 2026-10-22: users never see connectivity banners («Сервер LawBid
/// сейчас недоступен», «Снова в сети»). The connectivity providers and
/// their retry logic stay (screens and sync code still use them); only the
/// visible banner is gone, so this host now just passes [child] through.
/// The class and its call sites remain so the widget tree shape is stable.
class OfflineBannerHost extends StatelessWidget {
  const OfflineBannerHost({
    required this.child,
    super.key,
    this.enabled = true,
  });

  final Widget child;
  final bool enabled;

  @override
  Widget build(BuildContext context) => child;
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
