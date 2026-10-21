// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_qa_question_detail_envelope.dart';
import '../models/admin_qa_question_list_envelope.dart';
import '../models/admin_qa_status.dart';

part 'admin_legal_qa_client.g.dart';

@RestApi()
abstract class AdminLegalQaClient {
  factory AdminLegalQaClient(Dio dio, {String? baseUrl}) = _AdminLegalQaClient;

  /// All questions, hidden and removed too (search).
  ///
  /// [q] - Title or text.
  @GET('/admin/legal-qa/questions')
  Future<AdminQaQuestionListEnvelope> listAdminQuestions({
    @Query('q') String? q,
    @Query('status') AdminQaStatus? status,
    @Query('cursor') String? cursor,
    @Query('limit') int? limit,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A question with all its answers
  @GET('/admin/legal-qa/questions/{id}')
  Future<AdminQaQuestionDetailEnvelope> getAdminQuestion({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Take the «best answer» mark off
  @POST('/admin/legal-qa/questions/{id}/clear-best')
  Future<AdminQaQuestionDetailEnvelope> clearAdminQuestionBest({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
