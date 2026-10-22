// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/contact_sync_status_envelope.dart';
import '../models/contact_upload_result_envelope.dart';
import '../models/set_find_by_phone_dto.dart';
import '../models/set_notify_joined_dto.dart';
import '../models/upload_contact_hashes_dto.dart';

part 'contacts_sync_client.g.dart';

@RestApi()
abstract class ContactsSyncClient {
  factory ContactsSyncClient(Dio dio, {String? baseUrl}) = _ContactsSyncClient;

  /// Contacts sync: on/off, matches, last sync
  @GET('/contacts/sync')
  Future<ContactSyncStatusEnvelope> status({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Contacts sync: "changed?" by book hash, then only added / removed SHA-256 hashes of E.164 numbers (old builds: {hashes})
  @POST('/contacts/sync')
  Future<ContactUploadResultEnvelope> upload({
    @Body() required UploadContactHashesDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Turn contacts sync off and delete every match (idempotent)
  @DELETE('/contacts/sync')
  Future<void> remove({@Extras() Map<String, dynamic>? extras});

  /// «Notify me when contacts join LawBid» on or off
  @PUT('/contacts/sync/notify-joined')
  Future<void> setNotifyJoined({
    @Body() required SetNotifyJoinedDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Clients: allow or forbid being found by people who have my number
  @PUT('/contacts/sync/find-by-phone')
  Future<void> setFindByPhone({
    @Body() required SetFindByPhoneDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
