// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_dto_region_kind.dart';
import 'country_region_dto.dart';

part 'country_dto.g.dart';

@JsonSerializable()
class CountryDto {
  const CountryDto({
    required this.code,
    required this.name,
    required this.callingCode,
    required this.currency,
    required this.language,
    required this.regionKind,
    required this.timezone,
    required this.stripeSupported,
    required this.regions,
  });

  factory CountryDto.fromJson(Map<String, Object?> json) =>
      _$CountryDtoFromJson(json);

  final String code;
  final String name;

  /// Calling code without "+".
  final String callingCode;
  final String currency;
  final String language;
  final CountryDtoRegionKind regionKind;
  final String? timezone;

  /// In-app payments to attorneys work here.
  final bool stripeSupported;
  final List<CountryRegionDto> regions;

  Map<String, Object?> toJson() => _$CountryDtoToJson(this);
}
