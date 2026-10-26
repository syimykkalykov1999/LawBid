import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';
import 'package:lawbid/features/legal_qa/presentation/ask_question_screen.dart'
    deferred as d_ask_question_screen;
import 'package:lawbid/features/legal_qa/presentation/qa_feed_screen.dart'
    deferred as d_qa_feed_screen;
import 'package:lawbid/features/legal_qa/presentation/question_detail_screen.dart';

/// Owner 2026-10-20: «Вопрос юристу» — the public questions.
abstract final class LegalQaRoutes {
  static const feed = '/questions';
  static const ask = '/questions/ask';
  static const unanswered = '/questions?filter=unanswered';
  static String question(String id) => '/questions/${Uri.encodeComponent(id)}';
}

List<RouteBase> legalQaRoutes(GlobalKey<NavigatorState> root) => [
      GoRoute(
        path: LegalQaRoutes.feed,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'qa_feed_screen',
            load: d_qa_feed_screen.loadLibrary,
            builder: (_) => d_qa_feed_screen.QaFeedScreen(
              initialUnanswered:
                  state.uri.queryParameters['filter'] == 'unanswered',
            ),
          ),
        ),
      ),
      GoRoute(
        path: LegalQaRoutes.ask,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'ask_question_screen',
            load: d_ask_question_screen.loadLibrary,
            builder: (_) => d_ask_question_screen.AskQuestionScreen(
              initialState: state.uri.queryParameters['state'],
            ),
          ),
        ),
      ),
      GoRoute(
        path: '${LegalQaRoutes.feed}/:id',
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          QuestionDetailScreen(id: state.pathParameters['id']!),
        ),
      ),
    ];
