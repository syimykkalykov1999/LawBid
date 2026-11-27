// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'group_external_commit_dto.g.dart';

@JsonSerializable()
class GroupExternalCommitDto {
  const GroupExternalCommitDto({
    required this.deviceId,
    required this.epoch,
    required this.commit,
    this.groupInfo,
    this.groupInfoFileId,
    this.resync,
  });

  factory GroupExternalCommitDto.fromJson(Map<String, Object?> json) =>
      _$GroupExternalCommitDtoFromJson(json);

  /// Base64 MLSMessage (mls_group_info) of the epoch after this commit, with the ratchet_tree extension. Inline up to groups.e2ee_group_info_inline_kb KiB; otherwise groupInfoFileId.
  final String? groupInfo;

  /// A bigger GroupInfo: my uploaded chat_e2ee file holding it (direct upload, the server keeps only the id).
  final String? groupInfoFileId;

  /// My joining device.
  final String deviceId;

  /// The epoch of the GroupInfo it joined from.
  final num epoch;

  /// Base64 MLSMessage: the external commit (PublicMessage from a new_member_commit sender, RFC 9420 §12.4.3.2).
  final String commit;

  /// Resync: my device is in the group but lost its state; the commit removes its own old leaf (one Remove).
  final bool? resync;

  Map<String, Object?> toJson() => _$GroupExternalCommitDtoToJson(this);
}
