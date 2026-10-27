// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auto_action_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AutoActionDto _$AutoActionDtoFromJson(Map<String, dynamic> json) =>
    AutoActionDto(
      id: json['id'] as String,
      kind: AutoActionDtoKind.fromJson(json['kind'] as String),
      userId: json['userId'] as String,
      targetType: json['targetType'] as String?,
      targetId: json['targetId'] as String?,
      score: json['score'] as num,
      threshold: json['threshold'] as num,
      borderline: json['borderline'] as bool,
      enforced: json['enforced'] as bool,
      reason: json['reason'] as String?,
      expiresAt: json['expiresAt'] == null
          ? null
          : DateTime.parse(json['expiresAt'] as String),
      reversedAt: json['reversedAt'] == null
          ? null
          : DateTime.parse(json['reversedAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      canAppeal: json['canAppeal'] as bool,
      appealStatus: json['appealStatus'] as String?,
      appealMessage: json['appealMessage'] as String?,
      appealNote: json['appealNote'] as String?,
      appealAt: json['appealAt'] == null
          ? null
          : DateTime.parse(json['appealAt'] as String),
      autoApproved: json['autoApproved'] as bool,
    );

Map<String, dynamic> _$AutoActionDtoToJson(AutoActionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'kind': instance.kind.toJson(),
      'userId': instance.userId,
      'targetType': ?instance.targetType,
      'targetId': ?instance.targetId,
      'score': instance.score,
      'threshold': instance.threshold,
      'borderline': instance.borderline,
      'enforced': instance.enforced,
      'reason': ?instance.reason,
      'expiresAt': ?instance.expiresAt?.toIso8601String(),
      'reversedAt': ?instance.reversedAt?.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
      'canAppeal': instance.canAppeal,
      'appealStatus': ?instance.appealStatus,
      'appealMessage': ?instance.appealMessage,
      'appealNote': ?instance.appealNote,
      'appealAt': ?instance.appealAt?.toIso8601String(),
      'autoApproved': instance.autoApproved,
    };
