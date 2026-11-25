import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';
import 'package:lawbid/features/hotline/presentation/hotline_form_screen.dart'
    deferred as d_hotline_form_screen;
import 'package:lawbid/features/hotline/presentation/hotline_status_screen.dart'
    deferred as d_hotline_status_screen;

/// Owner row 87 (plan step 5): the client's call hotline. The screens load
/// on first use (web: a separate small part of the bundle).
abstract final class HotlineRoutes {
  /// «Позвонить адвокату» — the one-page form (mockup c2).
  static const form = '/hotline';

  /// Search, queue, «Сообщим», «Позвонить сейчас?» (mockup c6–c9b).
  static const status = '/hotline/status';
}

List<RouteBase> hotlineRoutes(GlobalKey<NavigatorState> root) => [
      GoRoute(
        path: HotlineRoutes.form,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'hotline_form_screen',
            load: d_hotline_form_screen.loadLibrary,
            builder: (_) => d_hotline_form_screen.HotlineFormScreen(),
          ),
        ),
      ),
      GoRoute(
        path: HotlineRoutes.status,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'hotline_status_screen',
            load: d_hotline_status_screen.loadLibrary,
            builder: (_) => d_hotline_status_screen.HotlineStatusScreen(),
          ),
        ),
      ),
    ];
