// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/my_rewards_envelope.dart';
import '../models/workspace_envelope.dart';

part 'admin_workspace_client.g.dart';

@RestApi()
abstract class AdminWorkspaceClient {
  factory AdminWorkspaceClient(Dio dio, {String? baseUrl}) =
      _AdminWorkspaceClient;

  /// My queues: how much waits, what is late
  @GET('/admin/workspace')
  Future<WorkspaceEnvelope> getWorkspace({
    @Extras() Map<String, dynamic>? extras,
  });

  /// «Лучший сотрудник»: my place per department (enabled=false when off)
  @GET('/admin/workspace/rewards')
  Future<MyRewardsEnvelope> getMyRewards({
    @Extras() Map<String, dynamic>? extras,
  });
}
