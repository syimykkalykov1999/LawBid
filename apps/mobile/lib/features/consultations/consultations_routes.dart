import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/features/consultations/presentation/consultation_detail_screen.dart';
import 'package:lawbid/features/consultations/presentation/consultation_settings_screen.dart';
import 'package:lawbid/features/consultations/presentation/consultations_screen.dart';

/// Owner 2026-10-20: «Консультации» — the list (both roles), one booking,
/// and the attorney's booking hours (Settings).
abstract final class ConsultationsRoutes {
  static const list = '/consultations';
  static const settings = '/profile/settings/consultations';
  static String detail(String id) =>
      '/consultations/${Uri.encodeComponent(id)}';
}

List<RouteBase> consultationsRoutes(GlobalKey<NavigatorState> root) => [
      GoRoute(
        path: ConsultationsRoutes.list,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const ConsultationsScreen()),
      ),
      GoRoute(
        path: ConsultationsRoutes.settings,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          const ConsultationSettingsScreen(),
        ),
      ),
      GoRoute(
        path: '/consultations/:id',
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          ConsultationDetailScreen(id: state.pathParameters['id']!),
        ),
      ),
    ];
