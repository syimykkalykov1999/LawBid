// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'bulk_countries_result_dto.g.dart';

@JsonSerializable()
class BulkCountriesResultDto {
  const BulkCountriesResultDto({required this.changed, required this.skipped});

  factory BulkCountriesResultDto.fromJson(Map<String, Object?> json) =>
      _$BulkCountriesResultDtoFromJson(json);

  final List<String> changed;

  /// Left off: no regions to pick yet.
  final List<String> skipped;

  Map<String, Object?> toJson() => _$BulkCountriesResultDtoToJson(this);
}
