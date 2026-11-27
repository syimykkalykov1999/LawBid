// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_group_mls_dto.g.dart';

@JsonSerializable()
class CreateGroupMlsDto {
  const CreateGroupMlsDto({
    required this.deviceId,
    required this.groupId,
    this.groupInfo,
    this.groupInfoFileId,
  });

  factory CreateGroupMlsDto.fromJson(Map<String, Object?> json) =>
      _$CreateGroupMlsDtoFromJson(json);

  /// Base64 MLSMessage (mls_group_info) of the epoch after this commit, with the ratchet_tree extension. Inline up to groups.e2ee_group_info_inline_kb KiB; otherwise groupInfoFileId.
  final String? groupInfo;

  /// A bigger GroupInfo: my uploaded chat_e2ee file holding it (direct upload, the server keeps only the id).
  final String? groupInfoFileId;

  /// The creating device.
  final String deviceId;

  /// Base64 of the MLS group_id: the UTF-8 bytes of "lawbid:g:<groupId>".
  final String groupId;

  Map<String, Object?> toJson() => _$CreateGroupMlsDtoToJson(this);
}
