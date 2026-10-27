// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'private_call_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PrivateCallItemDto _$PrivateCallItemDtoFromJson(Map<String, dynamic> json) =>
    PrivateCallItemDto(
      id: json['id'] as String,
      callerId: json['callerId'] as String,
      calleeId: json['calleeId'] as String,
      status: json['status'] as String,
      video: json['video'] as bool,
      isGroup: json['isGroup'] as bool,
      answeredAt: json['answeredAt'] == null
          ? null
          : DateTime.parse(json['answeredAt'] as String),
      endedAt: json['endedAt'] == null
          ? null
          : DateTime.parse(json['endedAt'] as String),
      durationSec: json['durationSec'] as num?,
      endReason: json['endReason'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$PrivateCallItemDtoToJson(PrivateCallItemDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'callerId': instance.callerId,
      'calleeId': instance.calleeId,
      'status': instance.status,
      'video': instance.video,
      'isGroup': instance.isGroup,
      'answeredAt': ?instance.answeredAt?.toIso8601String(),
      'endedAt': ?instance.endedAt?.toIso8601String(),
      'durationSec': ?instance.durationSec,
      'endReason': ?instance.endReason,
      'createdAt': instance.createdAt.toIso8601String(),
    };
