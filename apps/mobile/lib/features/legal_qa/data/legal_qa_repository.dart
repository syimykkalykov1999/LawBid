import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20 — `/questions*`.
class LegalQaRepository {
  LegalQaRepository(Dio dio) : _api = api.QuestionsClient(dio);

  final api.QuestionsClient _api;

  Future<CursorPage<Question>> list(
    QuestionsQuery query, {
    String? cursor,
  }) async {
    final q = query.q.trim();
    final env = await guardApiCall(
      () => _api.listQuestions(
        q: q.isEmpty ? null : q,
        practiceAreaId: query.practiceAreaId,
        stateCode: query.stateCode,
        filter: switch (query.filter) {
          QaFilter.all => api.QuestionFilter.all,
          QaFilter.unanswered => api.QuestionFilter.unanswered,
          QaFilter.solved => api.QuestionFilter.solved,
          QaFilter.mine => api.QuestionFilter.mine,
        },
        cursor: cursor,
      ),
    );
    return CursorPage(
      items: env.data.map(_question).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  Future<Question> detail(String id) async {
    final d = (await guardApiCall(() => _api.getQuestion(id: id))).data;
    return _question(
      api.QuestionDto(
        id: d.id,
        title: d.title,
        body: d.body,
        isAnonymous: d.isAnonymous,
        isMine: d.isMine,
        answerCount: d.answerCount,
        canAnswer: d.canAnswer,
        createdAt: d.createdAt,
        practiceArea: d.practiceArea,
        state: d.state,
        author: d.author,
        bestAnswerId: d.bestAnswerId,
        myAnswerId: d.myAnswerId,
      ),
      answers: d.answers,
    );
  }

  Future<Question> ask({
    required String title,
    required String body,
    String? practiceAreaId,
    String? stateCode,
    bool anonymous = false,
  }) async {
    final d = (await guardApiCall(
      () => _api.askQuestion(
        body: api.AskQuestionDto(
          title: title,
          body: body,
          practiceAreaId: practiceAreaId,
          stateCode: stateCode,
          anonymous: anonymous,
        ),
        extras: const {RequestFlags.createsResource: true},
      ),
    ))
        .data;
    return _question(d);
  }

  Future<void> delete(String id) =>
      guardApiCall(() => _api.deleteQuestion(id: id));

  Future<QaAnswer> answer(String id, String body) async => _answer(
        (await guardApiCall(
          () => _api.answerQuestion(
            id: id,
            body: api.AnswerBodyDto(body: body),
            extras: const {RequestFlags.createsResource: true},
          ),
        ))
            .data,
      );

  Future<void> deleteAnswer(String id) =>
      guardApiCall(() => _api.deleteQuestionAnswer(id: id));

  Future<QaAnswer> like(String id, String answerId, {required bool on}) async {
    final r = await guardApiCall(
      () => on
          ? _api.likeQuestionAnswer(id: id, answerId: answerId)
          : _api.unlikeQuestionAnswer(id: id, answerId: answerId),
    );
    return _answer(r.data);
  }

  Future<void> setBest(String id, String? answerId) => guardApiCall(
        () => answerId == null
            ? _api.clearBestAnswer(id: id)
            : _api.markBestAnswer(
                id: id,
                body: api.BestAnswerDto(answerId: answerId),
              ),
      );

  static QaPerson _person(api.QaPersonDto p) => QaPerson(
        id: p.id,
        displayName: p.displayName,
        username: p.username,
        avatarUrl: p.avatarUrl,
      );

  static QaAnswer _answer(api.AnswerDto a) => QaAnswer(
        id: a.id,
        questionId: a.questionId,
        attorney: _person(a.attorney),
        body: a.body,
        likeCount: a.likeCount,
        likedByMe: a.likedByMe,
        isBest: a.isBest,
        isMine: a.isMine,
        createdAt: DateTime.tryParse(a.createdAt) ?? DateTime.now(),
      );

  static Question _question(
    api.QuestionDto d, {
    List<api.AnswerDto> answers = const [],
  }) =>
      Question(
        id: d.id,
        title: d.title,
        body: d.body,
        isAnonymous: d.isAnonymous,
        isMine: d.isMine,
        answerCount: d.answerCount,
        canAnswer: d.canAnswer,
        createdAt: DateTime.tryParse(d.createdAt) ?? DateTime.now(),
        practiceArea: d.practiceArea == null
            ? null
            : QaPracticeArea(
                id: d.practiceArea!.id,
                i18nKey: d.practiceArea!.i18nKey,
                nameEn: d.practiceArea!.nameEn,
              ),
        stateCode: d.state?.code,
        stateName: d.state?.name,
        author: d.author == null ? null : _person(d.author!),
        bestAnswerId: d.bestAnswerId,
        myAnswerId: d.myAnswerId,
        answers: answers.map(_answer).toList(),
      );
}
