// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'country_waitlist_result_dto.g.dart';

@JsonSerializable()
class CountryWaitlistResultDto {
  const CountryWaitlistResultDto({
    required this.countryCode,
    required this.available,
  });

  factory CountryWaitlistResultDto.fromJson(Map<String, Object?> json) =>
      _$CountryWaitlistResultDtoFromJson(json);

  final String countryCode;

  /// True when the country is already open (nothing to wait for).
  final bool available;

  Map<String, Object?> toJson() => _$CountryWaitlistResultDtoToJson(this);
}
