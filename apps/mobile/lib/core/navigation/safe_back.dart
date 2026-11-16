import 'dart:async';

import 'package:flutter/material.dart';
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
/// * The screen is alone and a `PopScope` of it says «not now» (unsaved
///   work): the screen's own guard is asked (`maybePop` runs its
///   `onPopInvokedWithResult`); the guard then leaves with [safeLeave].
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
    // Row 161: alone with unsaved work — the screen's guard decides (and a
    // local history entry of the page, an open search, closes first).
    final route = ModalRoute.of(this);
    if (nav != null &&
        route != null &&
        (route.popDisposition == RoutePopDisposition.doNotPop ||
            route.willHandlePopInternally)) {
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

  /// Leaves the screen without asking its `PopScope` again (the screen has
  /// just asked, or saved): pops it with [result] when a page is below,
  /// else goes to [fallback] or the parent screen, as [safeBack].
  void safeLeave<T extends Object?>({T? result, String? fallback}) {
    final nav = Navigator.maybeOf(this);
    if (nav != null && nav.canPop()) {
      nav.pop<T>(result);
      return;
    }
    final router = GoRouter.maybeOf(this);
    if (router == null) return;
    router.go(fallback ?? parentLocation(router));
  }
}

/// Row 161: the leading of a Material `AppBar` on a router screen.
///
/// With a page below, `null`: the `AppBar` shows its own back arrow, as
/// before. Alone on a router page (a deep link, a web refresh) the `AppBar`
/// showed no arrow at all; then a [BackButton] that leads to the parent
/// screen. A screen hosted in a pane (its own one-page `Navigator`, not a
/// router page) keeps no arrow, as before.
Widget? safeBackLeading(BuildContext context, {String? fallback}) {
  final route = ModalRoute.of(context);
  if (route == null || route.impliesAppBarDismissal) return null;
  if (route.settings is! Page<Object?>) return null;
  if (GoRouter.maybeOf(context) == null) return null;
  return BackButton(onPressed: () => context.safeBack(fallback: fallback));
}

/// The nearest shorter path of the router's current location that matches
/// a route (query and fragment dropped), or [AppRoutes.feed].
String parentLocation(GoRouter router) => parentPathOf(
      router.configuration,
      router.routerDelegate.currentConfiguration.uri,
    );

/// [parentLocation] for any [uri] against the route table [config].
String parentPathOf(RouteConfiguration config, Uri uri) {
  final segments = [...uri.pathSegments.where((s) => s.isNotEmpty)];
  while (segments.isNotEmpty) {
    segments.removeLast();
    if (segments.isEmpty) break;
    final candidate = '/${segments.join('/')}';
    final match = config.findMatch(Uri.parse(candidate));
    if (match.isNotEmpty && !match.isError) return candidate;
  }
  return AppRoutes.feed;
}
