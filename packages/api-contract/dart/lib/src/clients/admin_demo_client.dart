// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_create_demo_account_dto.dart';
import '../models/admin_demo_account_created_envelope.dart';
import '../models/admin_demo_accounts_page_envelope.dart';
import '../models/admin_demo_invite_envelope.dart';
import '../models/demo_settings_dto.dart';
import '../models/demo_settings_envelope.dart';
import '../models/demo_status_envelope.dart';

part 'admin_demo_client.g.dart';

@RestApi()
abstract class AdminDemoClient {
  factory AdminDemoClient(Dio dio, {String? baseUrl}) = _AdminDemoClient;

  /// Demo mode settings
  @GET('/admin/demo/settings')
  Future<DemoSettingsEnvelope> getDemoSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change demo mode settings
  @PUT('/admin/demo/settings')
  Future<DemoSettingsEnvelope> updateDemoSettings({
    @Body() required DemoSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Is the demo world ready; counts; last reset
  @GET('/admin/demo/status')
  Future<DemoStatusEnvelope> getDemoStatus({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Demo accounts: who created them, last use
  @GET('/admin/demo/accounts')
  Future<AdminDemoAccountsPageEnvelope> listDemoAccounts({
    @Query('page') int? page = 1,
    @Query('limit') int? limit = 50,
    @Query('q') String? q,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create a demo account for a blogger (code shown once)
  @POST('/admin/demo/accounts')
  Future<AdminDemoAccountCreatedEnvelope> createDemoAccountForBlogger({
    @Body() required AdminCreateDemoAccountDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// New entry code (the old one stops working)
  @POST('/admin/demo/accounts/{id}/invite')
  Future<AdminDemoInviteEnvelope> mintDemoInvite({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a demo account and its data
  @DELETE('/admin/demo/accounts/{id}')
  Future<void> deleteDemoAccountAsAdmin({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Wipe the demo world and seed it again (deletes all demo accounts)
  @POST('/admin/demo/reset')
  Future<void> resetDemoWorld({@Extras() Map<String, dynamic>? extras});
}
