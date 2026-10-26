// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_ban_envelope.dart';
import '../models/admin_ban_list_envelope.dart';
import '../models/block_result_envelope.dart';
import '../models/block_user_dto.dart';
import '../models/create_ban_dto.dart';
import '../models/kind.dart';
import '../models/lift_ban_dto.dart';
import '../models/status3.dart';

part 'admin_sanctions_client.g.dart';

@RestApi()
abstract class AdminSanctionsClient {
  factory AdminSanctionsClient(Dio dio, {String? baseUrl}) =
      _AdminSanctionsClient;

  /// Blocks and bans, newest first.
  ///
  /// [q] - Phone, e-mail, device id or user id.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/admin/sanctions/bans')
  Future<AdminBanListEnvelope> listBans({
    @Query('kind') Kind? kind,
    @Query('q') String? q,
    @Query('cursor') String? cursor,
    @Query('status') Status3? status = Status3.active,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Ban a user, phone number, e-mail or device
  @POST('/admin/sanctions/bans')
  Future<AdminBanEnvelope> createBan({
    @Body() required CreateBanDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Lift a block or ban
  @POST('/admin/sanctions/bans/{id}/lift')
  Future<AdminBanEnvelope> liftBan({
    @Path('id') required String id,
    @Body() required LiftBanDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Block a user (days or for good), optionally their phone, e-mail and devices; sessions end at once
  @POST('/admin/sanctions/users/{id}/block')
  Future<BlockResultEnvelope> blockUser({
    @Path('id') required String id,
    @Body() required BlockUserDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
