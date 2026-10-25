// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'strike_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StrikeDto _$StrikeDtoFromJson(Map<String, dynamic> json) => StrikeDto(
  id: json['id'] as String,
  userId: json['userId'] as String,
  points: (json['points'] as num).toInt(),
  reason: json['reason'] as String?,
  targetType: json['targetType'] as String?,
  targetId: json['targetId'] as String?,
  actionId: json['actionId'] as String?,
  restriction: json['restriction'] as String?,
  restrictionUntil: json['restrictionUntil'] == null
      ? null
      : DateTime.parse(json['restrictionUntil'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
  expiresAt: DateTime.parse(json['expiresAt'] as String),
  revokedAt: json['revokedAt'] == null
      ? null
      : DateTime.parse(json['revokedAt'] as String),
  revokedNote: json['revokedNote'] as String?,
  active: json['active'] as bool,
);

Map<String, dynamic> _$StrikeDtoToJson(StrikeDto instance) => <String, dynamic>{
  'id': instance.id,
  'userId': instance.userId,
  'points': instance.points,
  'reason': ?instance.reason,
  'targetType': ?instance.targetType,
  'targetId': ?instance.targetId,
  'actionId': ?instance.actionId,
  'restriction': ?instance.restriction,
  'restrictionUntil': ?instance.restrictionUntil?.toIso8601String(),
  'createdAt': instance.createdAt.toIso8601String(),
  'expiresAt': instance.expiresAt.toIso8601String(),
  'revokedAt': ?instance.revokedAt?.toIso8601String(),
  'revokedNote': ?instance.revokedNote,
  'active': instance.active,
};
