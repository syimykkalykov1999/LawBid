// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'bulk_countries_dto.g.dart';

@JsonSerializable()
class BulkCountriesDto {
  const BulkCountriesDto({required this.enabled, this.codes});

  factory BulkCountriesDto.fromJson(Map<String, Object?> json) =>
      _$BulkCountriesDtoFromJson(json);

  /// Switch on (true) or off (false).
  final bool enabled;

  /// Only these countries; omitted = every country.
  final List<String>? codes;

  Map<String, Object?> toJson() => _$BulkCountriesDtoToJson(this);
}
