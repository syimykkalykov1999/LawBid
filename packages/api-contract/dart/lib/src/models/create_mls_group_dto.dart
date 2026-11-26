// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_mls_group_dto.g.dart';

@JsonSerializable()
class CreateMlsGroupDto {
  const CreateMlsGroupDto({required this.deviceId, required this.groupId});

  factory CreateMlsGroupDto.fromJson(Map<String, Object?> json) =>
      _$CreateMlsGroupDtoFromJson(json);

  /// The creating device.
  final String deviceId;

  /// Base64 of the MLS group_id (≤ 64 bytes).
  final String groupId;

  Map<String, Object?> toJson() => _$CreateMlsGroupDtoToJson(this);
}
