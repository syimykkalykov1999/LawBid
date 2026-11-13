// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/ai_assistant_status_envelope.dart';
import '../models/ai_pull_closed_envelope.dart';
import '../models/ai_pull_list_envelope.dart';
import '../models/ai_pull_merged_envelope.dart';
import '../models/ai_task_created_envelope.dart';
import '../models/approve_ai_pull_dto.dart';
import '../models/create_ai_task_dto.dart';
import '../models/reject_ai_pull_dto.dart';

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

  /// AI assistant: its open PRs (ai/… branches), CI and cost
  @GET('/admin/ai-assistant/pulls')
  Future<AiPullListEnvelope> listAiPulls({
    @Extras() Map<String, dynamic>? extras,
  });

  /// AI assistant: merge its PR (needs a fresh 2FA code)
  @POST('/admin/ai-assistant/pulls/{n}/approve')
  Future<AiPullMergedEnvelope> approveAiPull({
    @Path('n') required num n,
    @Body() required ApproveAiPullDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// AI assistant: close its PR with a comment
  @POST('/admin/ai-assistant/pulls/{n}/reject')
  Future<AiPullClosedEnvelope> rejectAiPull({
    @Path('n') required num n,
    @Body() required RejectAiPullDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
