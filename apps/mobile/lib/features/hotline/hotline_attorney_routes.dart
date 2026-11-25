import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';
import 'package:lawbid/features/hotline/presentation/hotline_line_screen.dart'
    deferred as d_hotline_line_screen;

/// Owner row 87 (plan step 6, mockup a2–a3): the attorney's call hotline.
/// The screen loads on first use (web: a separate small part of the bundle).
abstract final class HotlineAttorneyRoutes {
  /// «Моё → Вопросы → Горячая линия»: the line's settings and «На линии».
  static const line = '/hotline/line';
}

List<RouteBase> hotlineAttorneyRoutes(GlobalKey<NavigatorState> root) => [
      GoRoute(
        path: HotlineAttorneyRoutes.line,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'hotline_line_screen',
            load: d_hotline_line_screen.loadLibrary,
            builder: (_) => d_hotline_line_screen.HotlineLineScreen(),
          ),
        ),
      ),
    ];
