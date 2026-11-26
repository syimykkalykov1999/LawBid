// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'mls_group_member_device_dto.g.dart';

@JsonSerializable()
class MlsGroupMemberDeviceDto {
  const MlsGroupMemberDeviceDto({
    required this.deviceId,
    required this.userId,
    required this.signatureKey,
    required this.inGroup,
  });

  factory MlsGroupMemberDeviceDto.fromJson(Map<String, Object?> json) =>
      _$MlsGroupMemberDeviceDtoFromJson(json);

  final String deviceId;
  final String userId;

  /// Base64 Ed25519 public signature key.
  final String signatureKey;

  /// In the MLS group now.
  final bool inGroup;

  Map<String, Object?> toJson() => _$MlsGroupMemberDeviceDtoToJson(this);
}
