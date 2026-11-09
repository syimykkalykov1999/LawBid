// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/ai_assistant_status_envelope.dart';
import '../models/ai_task_created_envelope.dart';
import '../models/create_ai_task_dto.dart';

part 'admin_ai_assistant_client.g.dart';

@RestApi()
abstract class AdminAiAssistantClient {
  factory AdminAiAssistantClient(Dio dio, {String? baseUrl}) =
      _AdminAiAssistantClient;

  /// AI assistant: switch, money, tasks and runs
  @GET('/admin/ai-assistant')
  Future<AiAssistantStatusEnvelope> getAiAssistant({
    @Extras() Map<String, dynamic>? extras,
  });

  /// AI assistant: open a task (GitHub issue)
  @POST('/admin/ai-assistant/tasks')
  Future<AiTaskCreatedEnvelope> createAiTask({
    @Body() required CreateAiTaskDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
