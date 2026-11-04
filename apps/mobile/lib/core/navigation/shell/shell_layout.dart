import 'package:flutter/foundation.dart' show kIsWeb, visibleForTesting;
import 'package:flutter/widgets.dart'
    show BuildContext, InheritedWidget, MediaQuery, View, WidgetsBinding;

/// Owner 2026-10-15 (web): how the main shell lays out its navigation.
enum ShellLayout {
  /// The phone's floating bar at the bottom.
  bottom,

  /// A column of icons at the side (tablet-width windows).
  rail,

  /// A column with icons and names, and the content in a centred column
  /// (laptop and desktop windows).
  extendedRail,
}

/// Below this width the phone layout stays.
const double kShellRailMinWidth = 600;

/// From this width the column shows names and the content is centred.
const double kShellExtendedMinWidth = 840;

/// The widest the content column gets on a wide screen.
const double kShellContentMaxWidth = 680;

/// Switched with `--dart-define=ADAPTIVE_SHELL=true|false`; by default only
/// the web build adapts (phones and tablets keep the layout they have).
const bool kAdaptiveShell =
    bool.fromEnvironment('ADAPTIVE_SHELL', defaultValue: kIsWeb);

/// Tests set this to see the web layout on the VM.
@visibleForTesting
bool? adaptiveShellOverride;

/// Whether the adaptive layout is on (tests may force it).
bool get adaptiveShellOn => adaptiveShellOverride ?? kAdaptiveShell;

/// Whether the web's wide-window sizes apply (Instagram's web column, 3:4
/// grid tiles, the lower header): the adaptive layout in a window at least
/// [kShellRailMinWidth] wide. Owner 2026-10-18: in a phone's browser the web
/// looks exactly like the app.
bool get webWideWindow {
  if (!adaptiveShellOn) return false;
  final views = WidgetsBinding.instance.platformDispatcher.views;
  if (views.isEmpty) return true;
  final v = views.first;
  return v.physicalSize.width / v.devicePixelRatio >= kShellRailMinWidth;
}

/// The layout for a window [width] wide.
ShellLayout shellLayoutFor(double width, {bool adaptive = kAdaptiveShell}) {
  if (!adaptive || width < kShellRailMinWidth) return ShellLayout.bottom;
  return width < kShellExtendedMinWidth
      ? ShellLayout.rail
      : ShellLayout.extendedRail;
}

/// Owner 2026-10-15 (web): sheets and dialogs open over the content column
/// (same edges, same widest width), not over the whole window.
///
/// Measured from the view, not from MediaQuery: inside the content column
/// the query already holds the column's own size.
({double shift, double? maxWidth}) contentColumnBounds(
  double windowWidth, {
  bool? adaptive,
  bool auth = false,
}) {
  final layout = shellLayoutFor(
    windowWidth,
    adaptive: adaptive ?? adaptiveShellOn,
  );
  // Sign-in and onboarding: no side menu, a narrow column in the middle.
  if (auth && layout != ShellLayout.bottom) {
    return (
      shift: 0,
      maxWidth:
          windowWidth < kAuthColumnMaxWidth ? windowWidth : kAuthColumnMaxWidth,
    );
  }
  switch (layout) {
    case ShellLayout.bottom:
      return (shift: 0, maxWidth: null);
    case ShellLayout.rail:
      return (
        shift: kShellRailWidth / 2,
        maxWidth: windowWidth - kShellRailWidth
      );
    case ShellLayout.extendedRail:
      final free = windowWidth - kShellExtendedWidth;
      return (
        shift: kShellExtendedWidth / 2,
        maxWidth: free < kShellContentMaxWidth ? free : kShellContentMaxWidth,
      );
  }
}

/// The sign-in and onboarding column.
const double kAuthColumnMaxWidth = 480;

/// The side column widths, as in the side nav.
const double kShellRailWidth = 76;
const double kShellExtendedWidth = 220;

/// Locations that show no side menu on the web: the welcome screen,
/// sign-in and the onboarding steps.
bool isAuthLocation(String location) =>
    location == '/welcome' ||
    location == '/splash' ||
    location.startsWith('/auth/') ||
    location.startsWith('/onboarding/');

/// Desktop web plan 2026-10-28 §4: from this width (a usual laptop) the
/// web shows two panes where they help (chats list + the open chat).
const double kShellDesktopMinWidth = 1024;

/// From this width a third pane may open (contact info, a case's side
/// panel).
const double kShellDesktopWideMinWidth = 1440;

/// Desktop web plan §4: the size class of the window. The menu itself still
/// follows [shellLayoutFor]; this adds the two desktop classes above the
/// tablet ones. Phones (and the app on any device) are always [phone]
/// unless the adaptive web layout is on.
enum WindowClass {
  /// Under 600: the phone layout.
  phone,

  /// 600–839: the icon menu and one column.
  tablet,

  /// 840–1023: the menu with names and one 680 column.
  tabletWide,

  /// 1024–1439: two panes where a screen has them.
  desktop,

  /// 1440 and wider: up to three panes.
  desktopWide;

  /// Desktop or wider.
  bool get isDesktop => index >= desktop.index;
}

/// The window class for a window [width] wide.
WindowClass windowClassFor(double width, {bool? adaptive}) {
  if (!(adaptive ?? adaptiveShellOn) || width < kShellRailMinWidth) {
    return WindowClass.phone;
  }
  if (width < kShellExtendedMinWidth) return WindowClass.tablet;
  if (width < kShellDesktopMinWidth) return WindowClass.tabletWide;
  if (width < kShellDesktopWideMinWidth) return WindowClass.desktop;
  return WindowClass.desktopWide;
}

/// The window class at [context], measured from the view (inside a content
/// column the media query holds the column's width, not the window's).
///
/// Under a [WindowClassScope] (the app has one) the widget rebuilds only
/// when the class itself changes, not on every pixel of a window resize.
WindowClass windowClassOf(BuildContext context) {
  if (!adaptiveShellOn) return WindowClass.phone;
  final scope = context.dependOnInheritedWidgetOfExactType<WindowClassScope>();
  if (scope != null) return scope.windowClass;
  // No scope (a test): rebuilt with the media query instead.
  MediaQuery.maybeSizeOf(context);
  final view = View.maybeOf(context);
  if (view == null) return WindowClass.phone;
  return windowClassFor(view.physicalSize.width / view.devicePixelRatio);
}

/// Holds the window's class for the widgets below; placed by the app over
/// all routes (it is measured once there, from the window's own size).
class WindowClassScope extends InheritedWidget {
  const WindowClassScope({
    required this.windowClass,
    required super.child,
    super.key,
  });

  final WindowClass windowClass;

  @override
  bool updateShouldNotify(WindowClassScope oldWidget) =>
      windowClass != oldWidget.windowClass;
}

/// Whether the desktop layout applies at [context] (web, window ≥ 1024).
bool isDesktopWindow(BuildContext context) => windowClassOf(context).isDesktop;

/// Desktop web plan §5.3: pages drawn as «list | detail» on a desktop
/// window. They take the whole width next to the narrow menu instead of
/// the 680 column.
bool isListDetailLocation(String location) =>
    location == '/inbox' || location.startsWith('/chat/');

/// Desktop web plan §6.4: a case opened as a page (`/mine/case/:id`,
/// `/mine/work/:id`) is drawn as «cases list | case» on a desktop window,
/// so it also takes the whole width next to the narrow menu.
bool isCaseDetailLocation(String location) =>
    RegExp(r'^/mine/(case|work)/[^/]+$').hasMatch(location);

/// Desktop web plan §6.7: Settings is «sections list | section» — a page
/// that takes the whole width next to the narrow menu, like the chats.
bool isSettingsLocation(String location) =>
    location == '/profile/settings' || kSettingsSectionPaths.contains(location);

/// The Settings sections the desktop page shows in its right pane; their
/// own addresses (deep links, refresh) open that page with the section.
const Set<String> kSettingsSectionPaths = {
  '/profile/settings/account',
  '/profile/settings/notifications',
  '/profile/settings/privacy',
  '/profile/settings/devices',
  '/profile/settings/storage',
  '/profile/settings/blocked',
  '/profile/settings/data-export',
  '/profile/settings/about',
  '/profile/settings/payments',
  '/profile/settings/subscription',
  '/profile/settings/support',
  '/profile/settings/saved',
  '/profile/settings/archive',
  '/profile/settings/case-history',
  '/profile/settings/referral',
  '/profile/settings/partner',
  '/profile/settings/bid-packs',
  '/profile/settings/stars',
  '/profile/settings/verify-account',
  '/profile/settings/firm',
  '/profile/settings/stats',
  '/profile/settings/promotions',
};

/// Desktop web plan §6.5: someone's public profile page (`/lawyer/:name`)
/// draws the profile and its side pane across the window, not in the
/// 680 column.
bool isPublicProfileLocation(String location) =>
    RegExp(r'^/lawyer/[^/]+$').hasMatch(location);

/// Desktop web plan §4: the Search page is at most this wide on a desktop
/// window (its grid takes 3 to 5 tiles).
const double kSearchMaxWidth = 1200;

/// Desktop web plan §4: the cases list pane.
const double kCaseListPaneWidth = 400;

/// Desktop web plan §4: the case itself is at most this wide.
const double kCaseDetailMaxWidth = 760;

/// Desktop web plan §4: the Settings sections list is [kChatListPaneWidth]
/// wide; the open section is at most this wide.
const double kSettingsDetailMaxWidth = 680;

/// Desktop web plan §6.5: the profile (header + tabs) is at most this wide,
/// its side pane (counters, shortcuts) is the feed pane's 320.
const double kProfileMainMaxWidth = 720;

/// Desktop web plan §4: the chats list pane (wider from 1440).
const double kChatListPaneWidth = 360;
const double kChatListPaneWideWidth = 400;
