import 'package:flutter/material.dart';

/// Shared [RouteObserver], registered on `MaterialApp.router(observers: [...])`
/// in app.dart. Any widget that needs to know "is my screen still the
/// visible route" (e.g. `ScalesLogo` pausing its swing animation) subscribes
/// to this via [RouteAware] rather than each inventing its own visibility
/// tracking.
final routeObserver = RouteObserver<PageRoute<void>>();

/// Owner 2026-10-19: the keyboard never outlives its screen. Any push, pop
/// or replace drops the current focus, so a search field left focused
/// (e.g. the case wizard's topic search) does not keep the keyboard up on
/// the next screen; a field with autofocus on the new screen takes it
/// again after this.
class UnfocusOnNavigateObserver extends NavigatorObserver {
  void _unfocus() => FocusManager.instance.primaryFocus?.unfocus();

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      _unfocus();

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      _unfocus();

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) =>
      _unfocus();

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      _unfocus();
}
