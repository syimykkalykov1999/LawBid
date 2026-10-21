// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'call_history_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CallHistoryItemDto _$CallHistoryItemDtoFromJson(Map<String, dynamic> json) =>
    CallHistoryItemDto(
      id: json['id'] as String,
      status: CallHistoryStatus.fromJson(json['status'] as String),
      outgoing: json['outgoing'] as bool,
      video: json['video'] as bool,
      peer: CallPeerDto.fromJson(json['peer'] as Map<String, dynamic>),
      createdAt: DateTime.parse(json['createdAt'] as String),
      group: json['group'] as bool? ?? false,
      conversationId: json['conversationId'] as String?,
      groupId: json['groupId'] as String?,
      groupTitle: json['groupTitle'] as String?,
      groupAvatarUrl: json['groupAvatarUrl'] as String?,
      durationSec: (json['durationSec'] as num?)?.toInt(),
    );

Map<String, dynamic> _$CallHistoryItemDtoToJson(CallHistoryItemDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'status': instance.status.toJson(),
      'outgoing': instance.outgoing,
      'video': instance.video,
      'peer': instance.peer.toJson(),
      'conversationId': ?instance.conversationId,
      'groupId': ?instance.groupId,
      'groupTitle': ?instance.groupTitle,
      'groupAvatarUrl': ?instance.groupAvatarUrl,
      'group': instance.group,
      'createdAt': instance.createdAt.toIso8601String(),
      'durationSec': ?instance.durationSec,
    };
