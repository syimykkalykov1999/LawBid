// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'call_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CallDto _$CallDtoFromJson(Map<String, dynamic> json) => CallDto(
  id: json['id'] as String,
  conversationId: json['conversationId'] as String?,
  groupId: json['groupId'] as String?,
  callerId: json['callerId'] as String,
  calleeId: json['calleeId'] as String,
  status: CallStatus.fromJson(json['status'] as String),
  outgoing: json['outgoing'] as bool,
  peer: CallPeerDto.fromJson(json['peer'] as Map<String, dynamic>),
  participants: (json['participants'] as List<dynamic>)
      .map((e) => CallParticipantDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  createdAt: DateTime.parse(json['createdAt'] as String),
  hostId: json['hostId'] as String?,
  answeredAt: json['answeredAt'] == null
      ? null
      : DateTime.parse(json['answeredAt'] as String),
  endedAt: json['endedAt'] == null
      ? null
      : DateTime.parse(json['endedAt'] as String),
  durationSec: (json['durationSec'] as num?)?.toInt(),
  video: json['video'] as bool? ?? false,
  group: json['group'] as bool? ?? false,
);

Map<String, dynamic> _$CallDtoToJson(CallDto instance) => <String, dynamic>{
  'id': instance.id,
  'conversationId': ?instance.conversationId,
  'groupId': ?instance.groupId,
  'callerId': instance.callerId,
  'calleeId': instance.calleeId,
  'status': instance.status.toJson(),
  'outgoing': instance.outgoing,
  'video': instance.video,
  'peer': instance.peer.toJson(),
  'group': instance.group,
  'hostId': ?instance.hostId,
  'participants': instance.participants.map((e) => e.toJson()).toList(),
  'createdAt': instance.createdAt.toIso8601String(),
  'answeredAt': ?instance.answeredAt?.toIso8601String(),
  'endedAt': ?instance.endedAt?.toIso8601String(),
  'durationSec': ?instance.durationSec,
};
