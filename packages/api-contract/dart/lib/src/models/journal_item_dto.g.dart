// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'journal_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

JournalItemDto _$JournalItemDtoFromJson(Map<String, dynamic> json) =>
    JournalItemDto(
      id: json['id'] as String,
      action: json['action'] as String,
      targetType: JournalItemDtoTargetType.fromJson(
        json['targetType'] as String,
      ),
      targetId: json['targetId'] as String,
      reason: json['reason'] as String?,
      adminId: json['adminId'] as String,
      adminName: json['adminName'] as String?,
      appealStatus: json['appealStatus'] == null
          ? null
          : JournalItemDtoAppealStatus.fromJson(json['appealStatus'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$JournalItemDtoToJson(JournalItemDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'action': instance.action,
      'targetType': instance.targetType.toJson(),
      'targetId': instance.targetId,
      'reason': ?instance.reason,
      'adminId': instance.adminId,
      'adminName': ?instance.adminName,
      'appealStatus': ?instance.appealStatus?.toJson(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
