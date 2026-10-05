// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'add_country_region_dto.g.dart';

@JsonSerializable()
class AddCountryRegionDto {
  const AddCountryRegionDto({
    required this.code,
    required this.name,
    this.isoCode,
  });

  factory AddCountryRegionDto.fromJson(Map<String, Object?> json) =>
      _$AddCountryRegionDtoFromJson(json);

  final String code;
  final String name;
  final String? isoCode;

  Map<String, Object?> toJson() => _$AddCountryRegionDtoToJson(this);
}
