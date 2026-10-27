// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/staff_people_list_envelope.dart';
import '../models/staff_person_detail_envelope.dart';
import '../models/staff_rating_sort.dart';
import '../models/staff_rating_status.dart';
import '../models/staff_settings_envelope.dart';
import '../models/staff_shortlist_envelope.dart';
import '../models/staff_suggestion_kind.dart';
import '../models/staff_suggestion_list_envelope.dart';
import '../models/staff_suggestion_status.dart';
import '../models/staff_workspace_name.dart';

part 'admin_staff_client.g.dart';

@RestApi()
abstract class AdminStaffClient {
  factory AdminStaffClient(Dio dio, {String? baseUrl}) = _AdminStaffClient;

  /// Staff package switches and numbers (all off by default)
  @GET('/admin/staff/settings')
  Future<StaffSettingsEnvelope> getStaffSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Staff rating list (latest nightly snapshot), worst first.
  ///
  /// [workspace] - Owner only; a head always sees just their own workspace.
  @GET('/admin/staff/people')
  Future<StaffPeopleListEnvelope> staffPeople({
    @Query('limit') num? limit = 50,
    @Query('offset') num? offset = 0,
    @Query('status') StaffRatingStatus? status,
    @Query('workspace') StaffWorkspaceName? workspace,
    @Query('sort') StaffRatingSort? sort,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One person: rating, components, evidence and suggestions
  @GET('/admin/staff/people/{adminId}')
  Future<StaffPersonDetailEnvelope> staffPerson({
    @Path('adminId') required String adminId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The short list: the worst and the best (≤ 20 each).
  ///
  /// [workspace] - Owner only; a head always sees just their own workspace.
  @GET('/admin/staff/shortlist')
  Future<StaffShortlistEnvelope> staffShortlist({
    @Query('workspace') StaffWorkspaceName? workspace,
    @Extras() Map<String, dynamic>? extras,
  });

  /// What the system suggests about people (open by default).
  ///
  /// [workspace] - Owner only; a head always sees just their own workspace.
  @GET('/admin/staff/suggestions')
  Future<StaffSuggestionListEnvelope> staffSuggestions({
    @Query('limit') num? limit = 50,
    @Query('offset') num? offset = 0,
    @Query('status') StaffSuggestionStatus? status,
    @Query('kind') StaffSuggestionKind? kind,
    @Query('workspace') StaffWorkspaceName? workspace,
    @Extras() Map<String, dynamic>? extras,
  });
}
