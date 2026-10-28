// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'selfie_handoff_dto_reason.dart';

part 'selfie_handoff_dto.g.dart';

@JsonSerializable()
class SelfieHandoffDto {
  const SelfieHandoffDto({
    required this.sent,
    required this.phoneLast4,
    required this.reason,
  });

  factory SelfieHandoffDto.fromJson(Map<String, Object?> json) =>
      _$SelfieHandoffDtoFromJson(json);

  /// false = not sent: the number is on the STOP list or not a valid number (see reason).
  final bool sent;

  /// Last 4 digits of the number it went to.
  final String phoneLast4;
  final SelfieHandoffDtoReason? reason;

  Map<String, Object?> toJson() => _$SelfieHandoffDtoToJson(this);
}
