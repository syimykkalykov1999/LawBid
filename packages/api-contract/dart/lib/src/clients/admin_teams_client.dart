// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_member_duties_dto.dart';
import '../models/admin_remove_member_dto.dart';
import '../models/admin_team_envelope.dart';
import '../models/admin_team_row_list_envelope.dart';

part 'admin_teams_client.g.dart';

@RestApi()
abstract class AdminTeamsClient {
  factory AdminTeamsClient(Dio dio, {String? baseUrl}) = _AdminTeamsClient;

  /// Attorneys with assistants.
  ///
  /// [q] - Attorney name, @username or phone.
  @GET('/admin/teams')
  Future<AdminTeamRowListEnvelope> listAdminTeams({
    @Query('q') String? q,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A team: members, duties, recent activity.
  ///
  /// [id] - The attorney user id.
  @GET('/admin/teams/{id}')
  Future<AdminTeamEnvelope> getAdminTeam({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove an assistant (access ends at once)
  @POST('/admin/teams/members/{memberId}/remove')
  Future<AdminTeamEnvelope> removeAdminTeamMember({
    @Path('memberId') required String memberId,
    @Body() required AdminRemoveMemberDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change an assistant's duties
  @PATCH('/admin/teams/members/{memberId}/duties')
  Future<AdminTeamEnvelope> setAdminTeamMemberDuties({
    @Path('memberId') required String memberId,
    @Body() required AdminMemberDutiesDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
