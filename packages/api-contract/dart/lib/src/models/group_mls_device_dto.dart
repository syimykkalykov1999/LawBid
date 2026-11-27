// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'group_mls_device_dto.g.dart';

@JsonSerializable()
class GroupMlsDeviceDto {
  const GroupMlsDeviceDto({
    required this.deviceId,
    required this.userId,
    required this.signatureKey,
    required this.inGroup,
    this.lastCommitAt,
  });

  factory GroupMlsDeviceDto.fromJson(Map<String, Object?> json) =>
      _$GroupMlsDeviceDtoFromJson(json);

  final String deviceId;
  final String userId;

  /// Base64 Ed25519 public signature key.
  final String signatureKey;

  /// In the MLS group now.
  final bool inGroup;

  /// Its last accepted commit in this group (the self-update every groups.e2ee_update_days counts from it).
  final DateTime? lastCommitAt;

  Map<String, Object?> toJson() => _$GroupMlsDeviceDtoToJson(this);
}
