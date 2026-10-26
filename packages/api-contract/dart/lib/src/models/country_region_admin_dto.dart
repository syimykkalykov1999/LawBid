// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'country_region_admin_dto.g.dart';

@JsonSerializable()
class CountryRegionAdminDto {
  const CountryRegionAdminDto({
    required this.code,
    required this.name,
    required this.isoCode,
    required this.isActive,
    required this.attorneyAdvertisingLabel,
  });

  factory CountryRegionAdminDto.fromJson(Map<String, Object?> json) =>
      _$CountryRegionAdminDtoFromJson(json);

  /// Region (state) code.
  final String code;
  final String name;
  final String? isoCode;
  final bool isActive;

  /// Owner 2026-10-22 (audit #4 §5): attorneys licensed here show the.
  /// «Attorney Advertising» label (on by default for New York).
  final bool attorneyAdvertisingLabel;

  Map<String, Object?> toJson() => _$CountryRegionAdminDtoToJson(this);
}
