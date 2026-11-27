// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'group_claim_key_packages_dto.g.dart';

@JsonSerializable()
class GroupClaimKeyPackagesDto {
  const GroupClaimKeyPackagesDto({
    required this.deviceId,
    required this.deviceIds,
  });

  factory GroupClaimKeyPackagesDto.fromJson(Map<String, Object?> json) =>
      _$GroupClaimKeyPackagesDtoFromJson(json);

  /// My device that holds the right to commit (POST …/lease).
  final String deviceId;
  final List<String> deviceIds;

  Map<String, Object?> toJson() => _$GroupClaimKeyPackagesDtoToJson(this);
}
