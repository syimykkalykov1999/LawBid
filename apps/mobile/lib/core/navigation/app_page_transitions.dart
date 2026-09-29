import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// go_router page builders with LawBid's page motion (UI modernization
/// pass, 2026-09-27). Calm "shared axis" style: the incoming page fades in
/// while travelling a short distance ([AppMotion.pageSlideFraction]); the
/// outgoing page dims back slightly. Exit is faster than enter. Under
/// reduce-motion the transition is skipped entirely (instant swap).
///
/// iOS / macOS (owner 2026-09-29): pushes use [CupertinoPage] so the
/// platform's swipe-from-the-left-edge back gesture works everywhere — a
/// `CustomTransitionPage` has no interactive pop. Android keeps the shared
/// axis motion (its back gesture is system-level).
///
/// The welcome route deliberately keeps its plain `builder` (owner: the
/// welcome screen is not part of this pass).
abstract final class AppPageTransitions {
  static bool get _cupertino => switch (defaultTargetPlatform) {
        TargetPlatform.iOS || TargetPlatform.macOS => true,
        _ => false,
      };

  /// Standard push (forward navigation within a flow).
  static Page<void> push(GoRouterState state, Widget child) {
    if (_cupertino) {
      return CupertinoPage<void>(
        key: state.pageKey,
        name: state.name,
        child: child,
      );
    }
    return CustomTransitionPage<void>(
      key: state.pageKey,
      name: state.name,
      child: child,
      transitionDuration: AppMotion.pageEnter,
      reverseTransitionDuration: AppMotion.pageExit,
      transitionsBuilder: _sharedAxisX,
    );
  }

  /// Full-screen modal (the "+" create flow, file 07 §3.4): rises from
  /// the bottom and fades in.
  static Page<void> modal(GoRouterState state, Widget child) {
    if (_cupertino) {
      return CupertinoPage<void>(
        key: state.pageKey,
        name: state.name,
        fullscreenDialog: true,
        child: child,
      );
    }
    return CustomTransitionPage<void>(
      key: state.pageKey,
      name: state.name,
      child: child,
      fullscreenDialog: true,
      transitionDuration: AppMotion.pageEnter,
      reverseTransitionDuration: AppMotion.pageExit,
      transitionsBuilder: _modalY,
    );
  }

  /// Tab-root swap (shell → first screen after onboarding): fade only.
  static Page<void> fade(GoRouterState state, Widget child) {
    return CustomTransitionPage<void>(
      key: state.pageKey,
      name: state.name,
      child: child,
      transitionDuration: AppMotion.pageEnter,
      reverseTransitionDuration: AppMotion.pageExit,
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        if (context.reduceMotion) return child;
        return FadeTransition(
          opacity: CurvedAnimation(
            parent: animation,
            curve: AppMotion.enterCurve,
            reverseCurve: AppMotion.exitCurve,
          ),
          child: child,
        );
      },
    );
  }

  static Widget _sharedAxisX(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (context.reduceMotion) return child;
    final enter = CurvedAnimation(
      parent: animation,
      curve: AppMotion.enterCurve,
      reverseCurve: AppMotion.exitCurve,
    );
    final behind = CurvedAnimation(
      parent: secondaryAnimation,
      curve: AppMotion.enterCurve,
      reverseCurve: AppMotion.exitCurve,
    );
    return FadeTransition(
      opacity: enter,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(AppMotion.pageSlideFraction, 0),
          end: Offset.zero,
        ).animate(enter),
        // The page underneath drifts left a little as the new one arrives.
        child: SlideTransition(
          position: Tween<Offset>(
            begin: Offset.zero,
            end: const Offset(-AppMotion.pageSlideFraction / 2, 0),
          ).animate(behind),
          child: child,
        ),
      ),
    );
  }

  static Widget _modalY(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (context.reduceMotion) return child;
    final enter = CurvedAnimation(
      parent: animation,
      curve: AppMotion.enterCurve,
      reverseCurve: AppMotion.exitCurve,
    );
    return FadeTransition(
      opacity: enter,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, AppMotion.modalSlideFraction),
          end: Offset.zero,
        ).animate(enter),
        child: child,
      ),
    );
  }
}
