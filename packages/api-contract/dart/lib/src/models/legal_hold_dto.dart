// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_hold_dto_target_type.dart';

part 'legal_hold_dto.g.dart';

@JsonSerializable()
class LegalHoldDto {
  const LegalHoldDto({
    required this.id,
    required this.requestId,
    required this.targetType,
    required this.targetId,
    required this.createdAt,
    required this.expiresAt,
    required this.releasedAt,
  });

  factory LegalHoldDto.fromJson(Map<String, Object?> json) =>
      _$LegalHoldDtoFromJson(json);

  final String id;
  final String requestId;
  final LegalHoldDtoTargetType targetType;
  final String targetId;
  final String createdAt;
  final String? expiresAt;
  final String? releasedAt;

  Map<String, Object?> toJson() => _$LegalHoldDtoToJson(this);
}
