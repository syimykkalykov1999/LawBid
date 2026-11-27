// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/claim_key_packages_dto.dart';
import '../models/claimed_key_package_list_envelope.dart';
import '../models/conversation_e2ee_envelope.dart';
import '../models/create_group_mls_dto.dart';
import '../models/create_mls_group_dto.dart';
import '../models/e2ee_backup_envelope.dart';
import '../models/e2ee_backup_put_dto.dart';
import '../models/e2ee_report_dto.dart';
import '../models/e2ee_report_result_envelope.dart';
import '../models/group_claim_key_packages_dto.dart';
import '../models/group_e2ee_envelope.dart';
import '../models/group_external_commit_dto.dart';
import '../models/group_info_result_envelope.dart';
import '../models/group_mls_commit_dto.dart';
import '../models/group_mls_lease_dto.dart';
import '../models/group_mls_lease_result_envelope.dart';
import '../models/group_mls_welcome_list_envelope.dart';
import '../models/key_package_count_envelope.dart';
import '../models/mls_commit_dto.dart';
import '../models/mls_commit_row_list_envelope.dart';
import '../models/mls_device_envelope.dart';
import '../models/mls_device_list_envelope.dart';
import '../models/mls_epoch_envelope.dart';
import '../models/mls_rejoin_dto.dart';
import '../models/mls_welcome_list_envelope.dart';
import '../models/register_mls_device_dto.dart';
import '../models/upload_key_packages_dto.dart';

part 'e2ee_client.g.dart';

@RestApi()
abstract class E2eeClient {
  factory E2eeClient(Dio dio, {String? baseUrl}) = _E2eeClient;

  /// Register this device’s MLS signature key
  @POST('/e2ee/devices')
  Future<MlsDeviceEnvelope> registerMlsDevice({
    @Body() required RegisterMlsDeviceDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My devices that read encrypted chats
  @GET('/e2ee/devices')
  Future<MlsDeviceListEnvelope> listMlsDevices({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Sign a device out of encrypted chats
  @DELETE('/e2ee/devices/{id}')
  Future<void> revokeMlsDevice({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Upload one-time and last-resort KeyPackages
  @POST('/e2ee/devices/{id}/key-packages')
  Future<KeyPackageCountEnvelope> uploadMlsKeyPackages({
    @Path('id') required String id,
    @Body() required UploadKeyPackagesDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// How many KeyPackages this device has left
  @GET('/e2ee/devices/{id}/key-packages/count')
  Future<KeyPackageCountEnvelope> countMlsKeyPackages({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Welcomes waiting for one of my devices
  @GET('/e2ee/welcomes')
  Future<MlsWelcomeListEnvelope> listMlsWelcomes({
    @Query('deviceId') required String deviceId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The device joined from this Welcome
  @DELETE('/e2ee/welcomes/{id}')
  Future<void> ackMlsWelcome({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Is this chat end-to-end encrypted, and its group
  @GET('/e2ee/conversations/{id}')
  Future<ConversationE2eeEnvelope> getConversationE2ee({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create the chat’s MLS group (epoch 0)
  @POST('/e2ee/conversations/{id}/group')
  Future<ConversationE2eeEnvelope> createMlsGroup({
    @Path('id') required String id,
    @Body() required CreateMlsGroupDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One KeyPackage per device to add
  @POST('/e2ee/conversations/{id}/key-packages/claim')
  Future<ClaimedKeyPackageListEnvelope> claimMlsKeyPackages({
    @Path('id') required String id,
    @Body() required ClaimKeyPackagesDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My device could not join from its Welcome: re-add it
  @POST('/e2ee/conversations/{id}/rejoin')
  Future<void> requestMlsRejoin({
    @Path('id') required String id,
    @Body() required MlsRejoinDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A commit for the group’s current epoch (adds / removes)
  @POST('/e2ee/conversations/{id}/commits')
  Future<MlsEpochEnvelope> postMlsCommit({
    @Path('id') required String id,
    @Body() required MlsCommitDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Commits from an epoch on (catch up).
  ///
  /// [after] - Commits made in this epoch and later (default 0).
  @GET('/e2ee/conversations/{id}/commits')
  Future<MlsCommitRowListEnvelope> listMlsCommits({
    @Path('id') required String id,
    @Query('after') num? after,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Report a person of an encrypted chat with their last messages (WhatsApp)
  @POST('/e2ee/conversations/{id}/reports')
  Future<E2eeReportResultEnvelope> reportInE2eeChat({
    @Path('id') required String id,
    @Body() required E2eeReportDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My encrypted chat backup
  @GET('/e2ee/backup')
  Future<E2eeBackupEnvelope> getE2eeBackup({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Keep this encrypted file as my backup
  @POST('/e2ee/backup')
  Future<E2eeBackupEnvelope> putE2eeBackup({
    @Body() required E2eeBackupPutDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete my encrypted chat backup
  @DELETE('/e2ee/backup')
  Future<void> deleteE2eeBackup({@Extras() Map<String, dynamic>? extras});

  /// Group Welcomes waiting for one of my devices
  @GET('/e2ee/groups/welcomes')
  Future<GroupMlsWelcomeListEnvelope> listGroupMlsWelcomes({
    @Query('deviceId') required String deviceId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Is this group end-to-end encrypted, and its MLS group
  @GET('/e2ee/groups/{id}')
  Future<GroupE2eeEnvelope> getGroupE2ee({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create the group’s MLS group (epoch 0)
  @POST('/e2ee/groups/{id}/group')
  Future<GroupE2eeEnvelope> createGroupMls({
    @Path('id') required String id,
    @Body() required CreateGroupMlsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The right to commit in this group for a short time (one device at a time)
  @POST('/e2ee/groups/{id}/lease')
  Future<GroupMlsLeaseResultEnvelope> takeGroupMlsLease({
    @Path('id') required String id,
    @Body() required GroupMlsLeaseDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One KeyPackage per device to add (lease holder only)
  @POST('/e2ee/groups/{id}/key-packages/claim')
  Future<ClaimedKeyPackageListEnvelope> claimGroupMlsKeyPackages({
    @Path('id') required String id,
    @Body() required GroupClaimKeyPackagesDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A commit for the group’s current epoch, with the next GroupInfo
  @POST('/e2ee/groups/{id}/commits')
  Future<MlsEpochEnvelope> postGroupMlsCommit({
    @Path('id') required String id,
    @Body() required GroupMlsCommitDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Group commits from an epoch on (catch up).
  ///
  /// [after] - Commits made in this epoch and later (default 0).
  @GET('/e2ee/groups/{id}/commits')
  Future<MlsCommitRowListEnvelope> listGroupMlsCommits({
    @Path('id') required String id,
    @Query('after') num? after,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The latest GroupInfo with the ratchet tree (external join)
  @GET('/e2ee/groups/{id}/group-info')
  Future<GroupInfoResultEnvelope> getGroupInfo({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My device joins (or resyncs into) the group by external commit (members only)
  @POST('/e2ee/groups/{id}/external-commit')
  Future<MlsEpochEnvelope> postGroupExternalCommit({
    @Path('id') required String id,
    @Body() required GroupExternalCommitDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
