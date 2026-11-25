import 'package:go_router/go_router.dart';
import 'package:lawbid/core/diagnostics/crash_reporter.dart';

/// KNOWN_ERRORS 228 (owner 18.11, «the screen goes empty, nothing responds,
/// only closing the app helps» — after payments, calls, settings, photos,
/// chats, comments).
///
/// The cause: one `Navigator.pop()` too many while a navigator holds its
/// last page — the root navigator with only the tab shell under a sheet or
/// a dialog (every app sheet sits on the root navigator), or a tab's own
/// first screen. The usual way there: `await …; if (mounted)
/// Navigator.of(context).pop()` in a sheet that was swiped away during the
/// wait (it stays mounted while it slides out, and its slide stands still
/// while the app is in the background), or a second pop of a sheet that is
/// already closing. go_router 18 then removed that page's match
/// (`GoRouterDelegate._completeRouteMatch`) and its configuration became
/// empty — only a debug `assert` complains («You have popped the last page
/// off of the stack») — so `RouteBuilder.build` returned `SizedBox.shrink()`
/// for the whole app. Flutter drew nothing; what was seen is the native
/// window behind it, painted in the theme's background
/// (AppDelegate.paintWindowBackground / MainActivity, R-112). There was
/// nothing to tap, and system back found no page.
///
/// The fix sits in go_router itself (third_party/go_router, the same
/// 18.1.4 with one patch in `GoRouterDelegate._handlePopPageWithRouteMatch`):
/// a pop that would leave no page is refused, like `maybePop` on a first
/// route — the person stays where they were. This file only reports each
/// refused pop to «Система → Вылеты» with the stack of the code that
/// popped, so that place can be fixed too.
abstract final class LastPageGuard {
  static void install() {
    GoRouterDelegate.onLastPagePopRefused =
        (route, stack) => CrashReporter.instance?.report(
              StateError(
                'KNOWN_ERRORS 228: refused a pop of the last page '
                '(${route.settings.name})',
              ),
              stack,
            );
  }
}
