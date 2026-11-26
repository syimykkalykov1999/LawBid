// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'upload_key_packages_dto.g.dart';

@JsonSerializable()
class UploadKeyPackagesDto {
  const UploadKeyPackagesDto({required this.keyPackages, this.lastResort});

  factory UploadKeyPackagesDto.fromJson(Map<String, Object?> json) =>
      _$UploadKeyPackagesDtoFromJson(json);

  /// One-time KeyPackages (base64 MLSMessage, wire format mls_key_package). At most chat.e2ee_key_packages_target per call.
  final List<String> keyPackages;

  /// The last-resort KeyPackage (RFC 9420 §16.8): handed out only when no one-time package is left, never deleted by a claim. Replaces the previous one.
  final String? lastResort;

  Map<String, Object?> toJson() => _$UploadKeyPackagesDtoToJson(this);
}
