// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'verification_handoff_status.dart';

part 'verification_handoff_status_dto.g.dart';

@JsonSerializable()
class VerificationHandoffStatusDto {
  const VerificationHandoffStatusDto({
    required this.status,
    required this.requestId,
    required this.expiresAt,
  });

  factory VerificationHandoffStatusDto.fromJson(Map<String, Object?> json) =>
      _$VerificationHandoffStatusDtoFromJson(json);

  final VerificationHandoffStatus status;
  final String requestId;
  final DateTime expiresAt;

  Map<String, Object?> toJson() => _$VerificationHandoffStatusDtoToJson(this);
}
