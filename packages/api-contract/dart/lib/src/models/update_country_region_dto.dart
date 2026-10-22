// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_country_region_dto.g.dart';

@JsonSerializable()
class UpdateCountryRegionDto {
  const UpdateCountryRegionDto({this.isActive, this.attorneyAdvertisingLabel});

  factory UpdateCountryRegionDto.fromJson(Map<String, Object?> json) =>
      _$UpdateCountryRegionDtoFromJson(json);

  final bool? isActive;

  /// Owner 2026-10-22 (audit #4 §5): the «Attorney Advertising» switch.
  final bool? attorneyAdvertisingLabel;

  Map<String, Object?> toJson() => _$UpdateCountryRegionDtoToJson(this);
}
