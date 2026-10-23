import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/root_messenger.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';

/// Owner 2026-10-22: the Android SYSTEM back (hardware key, the gesture and
/// the gesture bar all reach Dart as `popRoute`) must always go to the
/// previous screen — the profile's post feed → the profile, a post → the
/// feed, settings pages → settings, a chat → the chat list — and close the
/// app only from the first tab, on a second press (Instagram).
///
/// The one rule, in order (docs/ux/GESTURES.md):
///  1. the top-most route above the tabs (page, dialog, sheet, a screen
///     opened with `Navigator.push`) closes — its `PopScope` is asked first;
///  2. else a page inside the current tab closes (go_router's own order);
///  3. else on Search / Mine / Profile → the first tab (Feed);
///  4. else (the first tab, or a signed-in screen that stands alone after a
///     `context.go`, e.g. the chat list) → the first tab; on the first tab
///     itself: «press again to leave» and the app closes on the second press
///     within [exitWindow];
///  5. else (splash, sign-in, onboarding) the platform's default.
///
/// Also keeps the engine told that Dart handles back, always: nested
/// navigators (the tab branches) notify it with their own state and a late
/// `canHandlePop: false` made Android close the app without asking Dart.
class SystemBackGuard extends StatefulWidget {
  const SystemBackGuard({
    required this.router,
    required this.rootNavigatorKey,
    required this.exitHint,
    required this.child,
    this.exitWindow = const Duration(seconds: 2),
    super.key,
  });

  final GoRouter router;
  final GlobalKey<NavigatorState> rootNavigatorKey;

  /// «Press back again to leave», in the app's language.
  final String Function() exitHint;
  final Duration exitWindow;
  final Widget child;

  /// The tab roots, in tab order; the first is where the app closes from.
  static const tabRoots = [
    AppRoutes.feed,
    AppRoutes.search,
    AppRoutes.mine,
    AppRoutes.profile,
  ];

  @override
  State<SystemBackGuard> createState() => _SystemBackGuardState();
}

class _SystemBackGuardState extends State<SystemBackGuard>
    with WidgetsBindingObserver {
  DateTime? _hintAt;

  @override
  void initState() {
    super.initState();
    // Runs after the router's own observer: whatever the router could not
    // close (it answers `false` and Android would exit) is decided here.
    WidgetsBinding.instance.addObserver(this);
    if (!kIsWeb) unawaited(SystemNavigator.setFrameworkHandlesBack(true));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Future<bool> didPopRoute() async {
    // The browser's back button is the router's job on the web.
    if (kIsWeb) return false;
    final root = widget.rootNavigatorKey.currentState;
    // 1. Anything above the tabs (also a screen opened with Navigator.push).
    if (root != null && root.canPop()) {
      await root.maybePop();
      return true;
    }
    // 2. A page inside the current tab, or a PopScope of the tab's screen.
    if (await widget.router.routerDelegate.popRoute()) return true;
    // 2b. The tab's own screen holds back with a PopScope (the feed's Chats
    // page slides back to the feed): the router skips the first route of a
    // tab, so ask the visible navigators ourselves, deepest first.
    if (await _askVisibleNavigators()) return true;

    final path = widget.router.routerDelegate.currentConfiguration.uri.path;
    if (isAuthLocation(path)) return false;
    final first = SystemBackGuard.tabRoots.first;
    // 3./4. Not on the first tab: go there.
    if (path != first) {
      widget.router.go(first);
      return true;
    }
    // The first tab: a second press within the window leaves.
    final now = DateTime.now();
    final at = _hintAt;
    if (at != null && now.difference(at) < widget.exitWindow) {
      _hintAt = null;
      return false;
    }
    _hintAt = now;
    rootMessengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(widget.exitHint()),
          duration: widget.exitWindow,
          behavior: SnackBarBehavior.floating,
        ),
      );
    return true;
  }

  /// `maybePop` on every navigator that is on screen (not the off-stage tabs),
  /// deepest first; true when one of them kept its route (a `PopScope` with
  /// `canPop: false` took the press) or popped it.
  Future<bool> _askVisibleNavigators() async {
    final start = widget.rootNavigatorKey.currentContext;
    if (start == null) return false;
    final found = <NavigatorState>[];
    void visit(Element e) {
      final w = e.widget;
      if (w is Offstage && w.offstage) return;
      if (e is StatefulElement && e.state is NavigatorState) {
        found.add(e.state as NavigatorState);
      }
      e.visitChildren(visit);
    }

    (start as Element).visitChildren(visit);
    for (final nav in found.reversed) {
      if (!nav.mounted) continue;
      if (await nav.maybePop()) return true;
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    // Navigators tell the engine whether they can pop; the answer of the
    // last one to speak used to win. Dart always decides here.
    return NotificationListener<NavigationNotification>(
      onNotification: (_) => !kIsWeb,
      child: widget.child,
    );
  }
}
