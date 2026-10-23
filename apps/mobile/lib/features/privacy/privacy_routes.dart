import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';
import 'package:lawbid/features/privacy/presentation/moderation_notices_screen.dart'
    deferred as d_moderation_notices_screen;
import 'package:lawbid/features/privacy/presentation/my_reports_screen.dart'
    deferred as d_my_reports_screen;
import 'package:lawbid/features/privacy/presentation/privacy_screen.dart'
    deferred as d_privacy_screen;

/// Owner 2026-10-20: Settings → Privacy and moderation.
abstract final class PrivacyRoutes {
  static const privacy = '/profile/settings/privacy';
  static const myReports = '/profile/settings/privacy/reports';
  static const notices = '/profile/settings/privacy/decisions';
}

List<RouteBase> privacyRoutes(GlobalKey<NavigatorState> root) => [
      GoRoute(
        path: PrivacyRoutes.privacy,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'privacy_screen',
            load: d_privacy_screen.loadLibrary,
            builder: (_) => d_privacy_screen.PrivacyScreen(),
          ),
        ),
      ),
      GoRoute(
        path: PrivacyRoutes.myReports,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'my_reports_screen',
            load: d_my_reports_screen.loadLibrary,
            builder: (_) => d_my_reports_screen.MyReportsScreen(),
          ),
        ),
      ),
      GoRoute(
        path: PrivacyRoutes.notices,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'moderation_notices_screen',
            load: d_moderation_notices_screen.loadLibrary,
            builder: (_) =>
                d_moderation_notices_screen.ModerationNoticesScreen(),
          ),
        ),
      ),
    ];
