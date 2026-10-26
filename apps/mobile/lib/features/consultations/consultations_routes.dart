import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';
import 'package:lawbid/features/consultations/presentation/consultation_detail_screen.dart'
    deferred as d_consultation_detail_screen;
import 'package:lawbid/features/consultations/presentation/consultation_settings_screen.dart'
    deferred as d_consultation_settings_screen;
import 'package:lawbid/features/consultations/presentation/consultations_screen.dart'
    deferred as d_consultations_screen;

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
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'consultations_screen',
            load: d_consultations_screen.loadLibrary,
            builder: (_) => d_consultations_screen.ConsultationsScreen(),
          ),
        ),
      ),
      GoRoute(
        path: ConsultationsRoutes.settings,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'consultation_settings_screen',
            load: d_consultation_settings_screen.loadLibrary,
            builder: (_) =>
                d_consultation_settings_screen.ConsultationSettingsScreen(),
          ),
        ),
      ),
      GoRoute(
        path: '/consultations/:id',
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'consultation_detail_screen',
            load: d_consultation_detail_screen.loadLibrary,
            builder: (_) =>
                d_consultation_detail_screen.ConsultationDetailScreen(
              id: state.pathParameters['id']!,
            ),
          ),
        ),
      ),
    ];
