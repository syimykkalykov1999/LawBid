// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'strike_dto.g.dart';

@JsonSerializable()
class StrikeDto {
  const StrikeDto({
    required this.id,
    required this.userId,
    required this.points,
    required this.reason,
    required this.targetType,
    required this.targetId,
    required this.actionId,
    required this.restriction,
    required this.restrictionUntil,
    required this.createdAt,
    required this.expiresAt,
    required this.revokedAt,
    required this.revokedNote,
    required this.active,
  });

  factory StrikeDto.fromJson(Map<String, Object?> json) =>
      _$StrikeDtoFromJson(json);

  final String id;
  final String userId;
  final int points;
  final String? reason;
  final String? targetType;
  final String? targetId;
  final String? actionId;
  final String? restriction;
  final DateTime? restrictionUntil;
  final DateTime createdAt;
  final DateTime expiresAt;
  final DateTime? revokedAt;
  final String? revokedNote;
  final bool active;

  Map<String, Object?> toJson() => _$StrikeDtoToJson(this);
}
