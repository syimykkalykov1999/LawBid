import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

/// Two quick taps on the same row must open the screen once: a second push
/// of the same location puts the same page key (and the navigator's
/// GlobalKeys) in the tree twice and the debug build shows a red screen.
extension PushOnce on BuildContext {
  /// `context.push(location)`, ignored while the same [location] is already
  /// on top or was pushed a moment ago.
  Future<T?> pushOnce<T extends Object?>(String location, {Object? extra}) {
    final router = GoRouter.of(this);
    final now = DateTime.now();
    final top = router.routerDelegate.currentConfiguration.uri.toString();
    final recent = _lastPush == location &&
        now.difference(_lastPushAt) < const Duration(milliseconds: 700);
    if (top == location || recent) return Future<T?>.value();
    _lastPush = location;
    _lastPushAt = now;
    return router.push<T>(location, extra: extra);
  }
}

String? _lastPush;
DateTime _lastPushAt = DateTime.fromMillisecondsSinceEpoch(0);
