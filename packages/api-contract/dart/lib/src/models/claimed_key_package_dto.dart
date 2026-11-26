// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'claimed_key_package_dto.g.dart';

@JsonSerializable()
class ClaimedKeyPackageDto {
  const ClaimedKeyPackageDto({
    required this.deviceId,
    required this.userId,
    this.keyPackage,
  });

  factory ClaimedKeyPackageDto.fromJson(Map<String, Object?> json) =>
      _$ClaimedKeyPackageDtoFromJson(json);

  final String deviceId;
  final String userId;

  /// Base64 MLSMessage; null when the device has none left.
  final String? keyPackage;

  Map<String, Object?> toJson() => _$ClaimedKeyPackageDtoToJson(this);
}
