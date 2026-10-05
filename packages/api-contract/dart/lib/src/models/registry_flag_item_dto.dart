// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_attorney_summary_dto.dart';
import 'admin_license_dto.dart';

part 'registry_flag_item_dto.g.dart';

@JsonSerializable()
class RegistryFlagItemDto {
  const RegistryFlagItemDto({
    required this.attorney,
    required this.license,
    required this.latestRequestId,
  });

  factory RegistryFlagItemDto.fromJson(Map<String, Object?> json) =>
      _$RegistryFlagItemDtoFromJson(json);

  final AdminAttorneySummaryDto attorney;
  final AdminLicenseDto license;

  /// The attorney's latest verification request (its card).
  final String? latestRequestId;

  Map<String, Object?> toJson() => _$RegistryFlagItemDtoToJson(this);
}
