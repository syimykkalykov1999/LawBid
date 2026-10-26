// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_demo_account_dto.dart';
import '../models/demo_current_envelope.dart';
import '../models/demo_me_envelope.dart';
import '../models/demo_session_envelope.dart';
import '../models/redeem_demo_invite_dto.dart';

part 'demo_client.g.dart';

@RestApi()
abstract class DemoClient {
  factory DemoClient(Dio dio, {String? baseUrl}) = _DemoClient;

  /// My demo accounts and whether I may create one
  @GET('/demo/me')
  Future<DemoMeEnvelope> getDemoMe({@Extras() Map<String, dynamic>? extras});

  /// Create a demo account of a role and get its session
  @POST('/demo/accounts')
  Future<DemoSessionEnvelope> createDemoAccount({
    @Body() required CreateDemoAccountDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Enter one of my demo accounts again
  @POST('/demo/accounts/{id}/session')
  Future<DemoSessionEnvelope> enterDemoAccount({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete one of my demo accounts and its data
  @DELETE('/demo/accounts/{id}')
  Future<void> deleteDemoAccount({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Enter a demo account with the code the LawBid team handed out
  @POST('/demo/invites/redeem')
  Future<DemoSessionEnvelope> redeemDemoInvite({
    @Body() required RedeemDemoInviteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The demo account I am in right now (demo session only)
  @GET('/demo/session')
  Future<DemoCurrentEnvelope> getDemoSession({
    @Extras() Map<String, dynamic>? extras,
  });
}
