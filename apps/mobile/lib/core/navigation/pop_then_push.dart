import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/pop_if_current.dart';

/// Hotline call bug 27.11 (owner, iPhone prod): in a hotline call the
/// name «…›», «Посмотреть профиль» and «Предложить дело» (and the
/// attorney's «Профиль клиента») minimised the call and opened… the
/// hotline's «Соединяем с адвокатом…» page instead of the profile.
///
/// Cause: the buttons ran `unawaited(Navigator.maybePop())` and then
/// `router.push(next)` in the same tick. `maybePop` is asynchronous (it
/// asks the route's `PopScope` first), so the push landed first and the
/// router's stack became `[… status, /call, /lawyer/x]`. The late pop of
/// `/call` then went through go_router's pop callback, and
/// `RouteMatchList.remove` keeps only the pages BELOW the popped one
/// (`matches.sublist(0, index)`, go_router BSD-3) — the new profile page
/// went together with the call page, and the page under the call (the
/// hotline status, «Соединяем с адвокатом…») was left on screen.
///
/// The fix is the order Flutter's own API gives: wait for `maybePop` to
/// finish (its `Future` completes after the pop has gone through the
/// navigator and go_router), then push. WhatsApp: the call goes on in the
/// green «Вернуться к звонку» bar and the profile opens over the screen
/// that was under the call.
extension PopThenPush on BuildContext {
  /// Leaves the route of this context (its `PopScope` is asked, and only
  /// while it is still the top route — see [PopIfCurrent]), and only then
  /// pushes [location] with [extra] on the app's router.
  Future<T?> popThenPush<T extends Object?>(
    String location, {
    Object? extra,
  }) async {
    final router = GoRouter.of(this);
    await maybePopIfCurrent<void>();
    return router.push<T>(location, extra: extra);
  }
}

/// [PopThenPush.popThenPush] for code that holds the [navigator] and the
/// [router] instead of a context (a host over every screen): pops the top
/// route of [navigator] (asking its `PopScope`) when [pop] is true, waits
/// for that pop to finish, then pushes [location].
Future<T?> popNavigatorThenPush<T extends Object?>({
  required NavigatorState? navigator,
  required GoRouter router,
  required String location,
  Object? extra,
  bool pop = true,
}) async {
  if (pop && navigator != null && navigator.mounted) {
    await navigator.maybePop<void>();
  }
  return router.push<T>(location, extra: extra);
}
