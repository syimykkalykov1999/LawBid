import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';
import 'package:lawbid/features/deadlines/presentation/deadline_calculator_screen.dart'
    deferred as d_deadline_calculator_screen;

/// Owner 2026-10-20: the deadline calculator, `/deadlines?state=NY&
/// practice=personal_injury&caseId=…&kind=statute`.
abstract final class DeadlinesRoutes {
  static const calculator = '/deadlines';

  /// A prefilled link (a case passes its state, practice and id).
  static String open({String? state, String? practice, String? caseId}) {
    final q = <String, String>{
      if (state != null && state.isNotEmpty) 'state': state,
      if (practice != null && practice.isNotEmpty) 'practice': practice,
      if (caseId != null && caseId.isNotEmpty) 'caseId': caseId,
    };
    return Uri(path: calculator, queryParameters: q.isEmpty ? null : q)
        .toString();
  }
}

List<RouteBase> deadlinesRoutes(GlobalKey<NavigatorState> root) => [
      GoRoute(
        path: DeadlinesRoutes.calculator,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'deadline_calculator_screen',
            load: d_deadline_calculator_screen.loadLibrary,
            builder: (_) =>
                d_deadline_calculator_screen.DeadlineCalculatorScreen(
              state: state.uri.queryParameters['state'],
              practice: state.uri.queryParameters['practice'],
              caseId: state.uri.queryParameters['caseId'],
              kind: state.uri.queryParameters['kind'],
            ),
          ),
        ),
      ),
    ];
