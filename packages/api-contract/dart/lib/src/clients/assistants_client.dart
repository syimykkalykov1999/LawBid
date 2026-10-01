// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/activity_list_envelope.dart';
import '../models/add_assistant_dto.dart';
import '../models/assistant_me_envelope.dart';
import '../models/assistant_phone_dto.dart';
import '../models/assistant_request_envelope.dart';
import '../models/assistant_request_list_envelope.dart';
import '../models/assistant_request_status.dart';
import '../models/create_assistant_request_dto.dart';
import '../models/create_task_dto.dart';
import '../models/decide_request_dto.dart';
import '../models/join_verify_dto.dart';
import '../models/task_envelope.dart';
import '../models/task_list_envelope.dart';
import '../models/task_step_input_dto.dart';
import '../models/tasks_view.dart';
import '../models/team_envelope.dart';
import '../models/update_assistant_dto.dart';
import '../models/update_task_dto.dart';
import '../models/update_task_status_dto.dart';
import '../models/update_task_step_dto.dart';

part 'assistants_client.g.dart';

@RestApi()
abstract class AssistantsClient {
  factory AssistantsClient(Dio dio, {String? baseUrl}) = _AssistantsClient;

  /// The assistant's own team state
  @GET('/assistants/me')
  Future<AssistantMeEnvelope> getAssistantMe({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Join the attorney who added this phone
  @POST('/assistants/join/accept')
  Future<AssistantMeEnvelope> acceptAssistantInvite({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Send a join code to the attorney's phone
  @POST('/assistants/join/request-code')
  Future<void> requestAssistantCode({
    @Body() required AssistantPhoneDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Join with the code the attorney received
  @POST('/assistants/join/verify')
  Future<AssistantMeEnvelope> verifyAssistantCode({
    @Body() required JoinVerifyDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Assistants, seats and duties
  @GET('/team')
  Future<TeamEnvelope> getTeam({@Extras() Map<String, dynamic>? extras});

  /// Add an assistant by phone (joins without a code)
  @POST('/team')
  Future<TeamEnvelope> addAssistant({
    @Body() required AddAssistantDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Rename an assistant or change their duties
  @PATCH('/team/{id}')
  Future<TeamEnvelope> updateAssistant({
    @Path('id') required String id,
    @Body() required UpdateAssistantDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove an assistant (access ends at once)
  @DELETE('/team/{id}')
  Future<TeamEnvelope> removeAssistant({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Everything the assistants did (hidden from them)
  @GET('/team/activity')
  Future<ActivityListEnvelope> getTeamActivity({
    @Query('membershipId') String? membershipId,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Assistant: ask the attorney to publish / apply something
  @POST('/team/requests')
  Future<AssistantRequestEnvelope> createAssistantRequest({
    @Body() required CreateAssistantRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Approval requests (an assistant sees only their own)
  @GET('/team/requests')
  Future<AssistantRequestListEnvelope> listAssistantRequests({
    @Query('status') AssistantRequestStatus? status,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Approve: published / applied as the attorney
  @POST('/team/requests/{id}/approve')
  Future<AssistantRequestEnvelope> approveAssistantRequest({
    @Path('id') required String id,
    @Body() required DecideRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reject an approval request
  @POST('/team/requests/{id}/reject')
  Future<AssistantRequestEnvelope> rejectAssistantRequest({
    @Path('id') required String id,
    @Body() required DecideRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Set a task for the attorney
  @POST('/tasks')
  Future<TaskEnvelope> createTask({
    @Body() required CreateTaskDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The attorney's tasks (calendar order).
  ///
  /// [mine] - Assistant: only the tasks they set (their Results).
  ///
  /// [from] - From this day (YYYY-MM-DD).
  @GET('/tasks')
  Future<TaskListEnvelope> listTasks({
    @Query('view') TasksView? view,
    @Query('mine') bool? mine,
    @Query('from') DateTime? from,
    @Query('to') DateTime? to,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One task
  @GET('/tasks/{id}')
  Future<TaskEnvelope> getTask({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit a task
  @PATCH('/tasks/{id}')
  Future<TaskEnvelope> updateTask({
    @Path('id') required String id,
    @Body() required UpdateTaskDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a task (with its steps)
  @DELETE('/tasks/{id}')
  Future<void> deleteTask({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Take / done / not done (+ note, + new time) / cancel
  @PATCH('/tasks/{id}/status')
  Future<TaskEnvelope> setTaskStatus({
    @Path('id') required String id,
    @Body() required UpdateTaskStatusDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add a step to a task's checklist
  @POST('/tasks/{id}/steps')
  Future<TaskEnvelope> addTaskStep({
    @Path('id') required String id,
    @Body() required TaskStepInputDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Check a step off / move it to another time
  @PATCH('/tasks/{id}/steps/{stepId}')
  Future<TaskEnvelope> updateTaskStep({
    @Path('id') required String id,
    @Path('stepId') required String stepId,
    @Body() required UpdateTaskStepDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove a step
  @DELETE('/tasks/{id}/steps/{stepId}')
  Future<TaskEnvelope> removeTaskStep({
    @Path('id') required String id,
    @Path('stepId') required String stepId,
    @Extras() Map<String, dynamic>? extras,
  });
}
