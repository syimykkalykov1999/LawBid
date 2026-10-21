// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_legal_hold_dto_target_type.dart';

part 'create_legal_hold_dto.g.dart';

@JsonSerializable()
class CreateLegalHoldDto {
  const CreateLegalHoldDto({
    required this.targetType,
    required this.targetId,
    this.expiresAt,
  });

  factory CreateLegalHoldDto.fromJson(Map<String, Object?> json) =>
      _$CreateLegalHoldDtoFromJson(json);

  final CreateLegalHoldDtoTargetType targetType;
  final String targetId;

  /// Omitted = until released by the owner.
  final DateTime? expiresAt;

  Map<String, Object?> toJson() => _$CreateLegalHoldDtoToJson(this);
}
