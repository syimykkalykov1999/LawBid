// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'claim_key_packages_dto.g.dart';

@JsonSerializable()
class ClaimKeyPackagesDto {
  const ClaimKeyPackagesDto({required this.deviceIds});

  factory ClaimKeyPackagesDto.fromJson(Map<String, Object?> json) =>
      _$ClaimKeyPackagesDtoFromJson(json);

  final List<String> deviceIds;

  Map<String, Object?> toJson() => _$ClaimKeyPackagesDtoToJson(this);
}
