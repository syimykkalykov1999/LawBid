import 'package:flutter/widgets.dart';

/// Round 1 app check 25.11 (pack A, KNOWN_ERRORS 230): about 45 sheets and
/// screens closed themselves with `await …; if (mounted)
/// Navigator.of(context).pop()`. A sheet swiped away during the wait is
/// still mounted while it slides out, so that late pop closed the page
/// UNDER it — the chat, the case, the profile, the call screen.
///
/// The fix is Flutter's own check, already used by the app's sheet handle
/// (`app_sheet_handle.dart`) and the message menu
/// (`message_context_menu.dart`): pop only while this route is still the
/// navigator's current one (`ModalRoute.isCurrent`, Flutter BSD-3). A route
/// that is leaving, covered by a newer page, or gone, is left alone.
extension PopIfCurrent on BuildContext {
  /// Pops the route of this context with [result] when it is still the top
  /// route of its navigator. Returns whether it popped.
  bool popIfCurrent<T extends Object?>([T? result]) {
    if (!mounted) return false;
    final nav = Navigator.maybeOf(this);
    final route = ModalRoute.of(this);
    if (nav == null || route == null) return false;
    return popRouteIfCurrent<T>(nav, route, result);
  }

  /// `Navigator.maybePop` (the route's `PopScope` is asked) only while the
  /// route of this context is on top.
  Future<bool> maybePopIfCurrent<T extends Object?>([T? result]) async {
    if (!isCurrentRoute) return false;
    return Navigator.of(this).maybePop<T>(result);
  }

  /// Whether the route of this context is still the top one of its
  /// navigator — for a screen that leaves by go_router (`context.pop()`
  /// pops the router's TOP page, whichever it is) after an `await`. True
  /// for a context without a route (a pane, a test host).
  bool get isCurrentRoute =>
      mounted && (ModalRoute.of(this)?.isCurrent ?? true);
}

/// [PopIfCurrent.popIfCurrent] for code that kept the [nav] and its own
/// [route] before an `await` (its context may be gone by then).
bool popRouteIfCurrent<T extends Object?>(
  NavigatorState nav,
  Route<Object?> route, [
  T? result,
]) {
  if (!nav.mounted || !route.isCurrent) return false;
  nav.pop<T>(result);
  return true;
}
