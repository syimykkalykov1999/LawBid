import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/features/privacy/presentation/moderation_notices_screen.dart';
import 'package:lawbid/features/privacy/presentation/my_reports_screen.dart';
import 'package:lawbid/features/privacy/presentation/privacy_screen.dart';

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
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const PrivacyScreen()),
      ),
      GoRoute(
        path: PrivacyRoutes.myReports,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const MyReportsScreen()),
      ),
      GoRoute(
        path: PrivacyRoutes.notices,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const ModerationNoticesScreen()),
      ),
    ];
