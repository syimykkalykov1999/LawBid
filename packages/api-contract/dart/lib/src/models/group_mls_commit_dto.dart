// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'group_mls_commit_dto.g.dart';

@JsonSerializable()
class GroupMlsCommitDto {
  const GroupMlsCommitDto({
    required this.deviceId,
    required this.epoch,
    required this.commit,
    required this.addedDevices,
    required this.removedDevices,
    this.welcome,
    this.groupInfo,
    this.groupInfoFileId,
  });

  factory GroupMlsCommitDto.fromJson(Map<String, Object?> json) =>
      _$GroupMlsCommitDtoFromJson(json);

  /// The committing device.
  final String deviceId;

  /// The epoch the commit was made in.
  final num epoch;

  /// Base64 MLSMessage with the commit (PublicMessage preferred: the server checks its adds).
  final String commit;
  final List<String> addedDevices;
  final List<String> removedDevices;

  /// Base64 MLSMessage (mls_welcome) for the added devices; required when any is added.
  final String? welcome;

  /// Base64 MLSMessage (mls_group_info) of the epoch after this commit, with the ratchet_tree extension. Required unless groupInfoFileId.
  final String? groupInfo;

  /// A bigger GroupInfo as my uploaded chat_e2ee file.
  final String? groupInfoFileId;

  Map<String, Object?> toJson() => _$GroupMlsCommitDtoToJson(this);
}
