// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sms_consent_request_dto.g.dart';

@JsonSerializable()
class SmsConsentRequestDto {
  const SmsConsentRequestDto({
    required this.purpose,
    required this.disclosureVersion,
  });

  factory SmsConsentRequestDto.fromJson(Map<String, Object?> json) =>
      _$SmsConsentRequestDtoFromJson(json);

  /// marketing | notifications
  final String purpose;

  /// The disclosure version the app showed.
  final String disclosureVersion;

  Map<String, Object?> toJson() => _$SmsConsentRequestDtoToJson(this);
}
