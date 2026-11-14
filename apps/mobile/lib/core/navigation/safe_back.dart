import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';

/// Detective R2 item 2 (14.11): the back arrow of a screen that stands
/// alone on its navigator — a web refresh on lawbid.dev, a deep link, a
/// payment return (`router.go`) — did nothing (`maybePop`) or threw
/// «nothing to pop» (`context.pop()`).
///
/// The fix is go_router's documented idiom (BSD-3), the same one the app
/// already uses at `bid_detail_screen.dart` and `owner_case_screen.dart`:
/// `canPop() ? pop() : go(parent)` — back always leads to the parent
/// screen, as on iPhone and in Telegram.
///
/// * The page under this one exists: `Navigator.maybePop`, so a `PopScope`
///   of the screen («discard the draft?») is still asked first, as before.
/// * The screen is alone: `go(fallback)`; without a `fallback` the parent
///   is the nearest shorter path of the current location that the router
///   knows (`/profile/settings/blocked` → `/profile/settings`), else Feed.
extension SafeBack on BuildContext {
  /// The back arrow's action: the previous page, or the parent screen.
  void safeBack({String? fallback}) {
    final nav = Navigator.maybeOf(this);
    if (nav != null && nav.canPop()) {
      unawaited(nav.maybePop());
      return;
    }
    final router = GoRouter.maybeOf(this);
    if (router == null) {
      if (nav != null) unawaited(nav.maybePop());
      return;
    }
    router.go(fallback ?? parentLocation(router));
  }
}

/// The nearest shorter path of the router's current location that matches
/// a route (query and fragment dropped), or [AppRoutes.feed].
String parentLocation(GoRouter router) {
  final uri = router.routerDelegate.currentConfiguration.uri;
  final segments = [...uri.pathSegments.where((s) => s.isNotEmpty)];
  while (segments.isNotEmpty) {
    segments.removeLast();
    if (segments.isEmpty) break;
    final candidate = '/${segments.join('/')}';
    final match = router.configuration.findMatch(Uri.parse(candidate));
    if (match.isNotEmpty && !match.isError) return candidate;
  }
  return AppRoutes.feed;
}
