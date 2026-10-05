// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'join_country_waitlist_dto.g.dart';

@JsonSerializable()
class JoinCountryWaitlistDto {
  const JoinCountryWaitlistDto({
    required this.countryCode,
    required this.email,
    this.locale,
  });

  factory JoinCountryWaitlistDto.fromJson(Map<String, Object?> json) =>
      _$JoinCountryWaitlistDtoFromJson(json);

  final String countryCode;
  final String email;
  final String? locale;

  Map<String, Object?> toJson() => _$JoinCountryWaitlistDtoToJson(this);
}
