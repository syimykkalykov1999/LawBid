// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'appeal_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AppealItemDto _$AppealItemDtoFromJson(Map<String, dynamic> json) =>
    AppealItemDto(
      id: json['id'] as String,
      status: AppealItemDtoStatus.fromJson(json['status'] as String),
      targetType: AppealItemDtoTargetType.fromJson(
        json['targetType'] as String,
      ),
      targetId: json['targetId'] as String,
      action: AppealItemDtoAction.fromJson(json['action'] as String),
      actionReason: json['actionReason'] as String?,
      message: json['message'] as String,
      excerpt: json['excerpt'] as String?,
      targetStatus: json['targetStatus'] as String?,
      appellantId: json['appellantId'] as String,
      appellantName: json['appellantName'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      decidedAt: json['decidedAt'] == null
          ? null
          : DateTime.parse(json['decidedAt'] as String),
      decisionNote: json['decisionNote'] as String?,
    );

Map<String, dynamic> _$AppealItemDtoToJson(AppealItemDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'status': instance.status.toJson(),
      'targetType': instance.targetType.toJson(),
      'targetId': instance.targetId,
      'action': instance.action.toJson(),
      'actionReason': ?instance.actionReason,
      'message': instance.message,
      'excerpt': ?instance.excerpt,
      'targetStatus': ?instance.targetStatus,
      'appellantId': instance.appellantId,
      'appellantName': ?instance.appellantName,
      'createdAt': instance.createdAt.toIso8601String(),
      'decidedAt': ?instance.decidedAt?.toIso8601String(),
      'decisionNote': ?instance.decisionNote,
    };
