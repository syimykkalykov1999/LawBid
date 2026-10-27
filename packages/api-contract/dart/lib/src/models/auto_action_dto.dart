// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'auto_action_dto_kind.dart';

part 'auto_action_dto.g.dart';

@JsonSerializable()
class AutoActionDto {
  const AutoActionDto({
    required this.id,
    required this.kind,
    required this.userId,
    required this.targetType,
    required this.targetId,
    required this.score,
    required this.threshold,
    required this.borderline,
    required this.enforced,
    required this.reason,
    required this.expiresAt,
    required this.reversedAt,
    required this.createdAt,
    required this.canAppeal,
    required this.appealStatus,
    required this.appealMessage,
    required this.appealNote,
    required this.appealAt,
    required this.autoApproved,
  });

  factory AutoActionDto.fromJson(Map<String, Object?> json) =>
      _$AutoActionDtoFromJson(json);

  final String id;
  final AutoActionDtoKind kind;
  final String userId;
  final String? targetType;
  final String? targetId;
  final num score;
  final num threshold;
  final bool borderline;
  final bool enforced;
  final String? reason;
  final DateTime? expiresAt;
  final DateTime? reversedAt;
  final DateTime createdAt;
  final bool canAppeal;
  final String? appealStatus;
  final String? appealMessage;
  final String? appealNote;
  final DateTime? appealAt;
  final bool autoApproved;

  Map<String, Object?> toJson() => _$AutoActionDtoToJson(this);
}
