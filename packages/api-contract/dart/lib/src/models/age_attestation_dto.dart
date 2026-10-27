// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'age_attestation_dto.g.dart';

@JsonSerializable()
class AgeAttestationDto {
  const AgeAttestationDto({
    required this.confirmed,
    required this.textVersion,
    this.birthDate,
  });

  factory AgeAttestationDto.fromJson(Map<String, Object?> json) =>
      _$AgeAttestationDtoFromJson(json);

  /// The person ticked "I am 18 or older".
  final bool confirmed;

  /// Wording version shown next to the checkbox (GET /config/age-gate).
  final String textVersion;

  /// YYYY-MM-DD; optional.
  final String? birthDate;

  Map<String, Object?> toJson() => _$AgeAttestationDtoToJson(this);
}
