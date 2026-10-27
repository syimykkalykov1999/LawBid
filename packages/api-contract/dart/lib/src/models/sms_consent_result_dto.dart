// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sms_consent_result_dto.g.dart';

@JsonSerializable()
class SmsConsentResultDto {
  const SmsConsentResultDto({
    required this.recorded,
    required this.blockedUntilStart,
  });

  factory SmsConsentResultDto.fromJson(Map<String, Object?> json) =>
      _$SmsConsentResultDtoFromJson(json);

  final bool recorded;

  /// The number sent STOP: it must text START.
  final bool blockedUntilStart;

  Map<String, Object?> toJson() => _$SmsConsentResultDtoToJson(this);
}
