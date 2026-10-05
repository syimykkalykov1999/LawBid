// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'country_region_dto.g.dart';

@JsonSerializable()
class CountryRegionDto {
  const CountryRegionDto({
    required this.code,
    required this.name,
    required this.isoCode,
  });

  factory CountryRegionDto.fromJson(Map<String, Object?> json) =>
      _$CountryRegionDtoFromJson(json);

  /// Region (state) code.
  final String code;
  final String name;
  final String? isoCode;

  Map<String, Object?> toJson() => _$CountryRegionDtoToJson(this);
}
