// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/answer_body_dto.dart';
import '../models/answer_envelope.dart';
import '../models/ask_question_dto.dart';
import '../models/best_answer_dto.dart';
import '../models/qa_summary_envelope.dart';
import '../models/question_detail_envelope.dart';
import '../models/question_envelope.dart';
import '../models/question_filter.dart';
import '../models/question_list_envelope.dart';
import '../models/question_scope.dart';

part 'questions_client.g.dart';

@RestApi()
abstract class QuestionsClient {
  factory QuestionsClient(Dio dio, {String? baseUrl}) = _QuestionsClient;

  /// Public questions to lawyers (search, filters).
  ///
  /// [scope] - Attorneys only: «mine» keeps questions of my practice areas (with parent/child areas) and of states where I hold a verified licence; a question without an area or state stays. No areas set — same as «all».
  @GET('/questions')
  Future<QuestionListEnvelope> listQuestions({
    @Query('limit') int? limit = 20,
    @Query('q') String? q,
    @Query('practiceAreaId') String? practiceAreaId,
    @Query('stateCode') String? stateCode,
    @Query('filter') QuestionFilter? filter,
    @Query('scope') QuestionScope? scope,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Ask a question (client)
  @POST('/questions')
  Future<QuestionEnvelope> askQuestion({
    @Body() required AskQuestionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Attorney: fresh unanswered questions in my practice
  @GET('/questions/summary')
  Future<QaSummaryEnvelope> freshForMe({
    @Extras() Map<String, dynamic>? extras,
  });

  /// A question with its answers
  @GET('/questions/{id}')
  Future<QuestionDetailEnvelope> getQuestion({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete my question
  @DELETE('/questions/{id}')
  Future<void> deleteQuestion({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Close my question
  @PUT('/questions/{id}/close')
  Future<void> closeQuestion({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Answer (or edit my answer) — verified attorney
  @PUT('/questions/{id}/answer')
  Future<AnswerEnvelope> answerQuestion({
    @Path('id') required String id,
    @Body() required AnswerBodyDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete my answer
  @DELETE('/questions/{id}/answer')
  Future<void> deleteQuestionAnswer({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Like an answer
  @PUT('/questions/{id}/answers/{answerId}/like')
  Future<AnswerEnvelope> likeQuestionAnswer({
    @Path('id') required String id,
    @Path('answerId') required String answerId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove my like
  @DELETE('/questions/{id}/answers/{answerId}/like')
  Future<AnswerEnvelope> unlikeQuestionAnswer({
    @Path('id') required String id,
    @Path('answerId') required String answerId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Mark the best answer (the question author)
  @PUT('/questions/{id}/best')
  Future<QuestionDetailEnvelope> markBestAnswer({
    @Path('id') required String id,
    @Body() required BestAnswerDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Clear the best-answer mark
  @DELETE('/questions/{id}/best')
  Future<QuestionDetailEnvelope> clearBestAnswer({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
