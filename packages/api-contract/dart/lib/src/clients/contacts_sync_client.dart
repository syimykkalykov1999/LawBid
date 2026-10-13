// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/contact_sync_status_envelope.dart';
import '../models/contact_upload_result_envelope.dart';
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

  /// Upload SHA-256 hashes of address-book numbers (E.164); only matches with LawBid users are kept
  @POST('/contacts/sync')
  Future<ContactUploadResultEnvelope> upload({
    @Body() required UploadContactHashesDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Turn contacts sync off and delete every match (idempotent)
  @DELETE('/contacts/sync')
  Future<void> remove({@Extras() Map<String, dynamic>? extras});
}
