// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'call_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CallDto _$CallDtoFromJson(Map<String, dynamic> json) => CallDto(
  id: json['id'] as String,
  conversationId: json['conversationId'] as String,
  callerId: json['callerId'] as String,
  calleeId: json['calleeId'] as String,
  status: CallStatus.fromJson(json['status'] as String),
  outgoing: json['outgoing'] as bool,
  peer: CallPeerDto.fromJson(json['peer'] as Map<String, dynamic>),
  createdAt: DateTime.parse(json['createdAt'] as String),
  answeredAt: json['answeredAt'] == null
      ? null
      : DateTime.parse(json['answeredAt'] as String),
  endedAt: json['endedAt'] == null
      ? null
      : DateTime.parse(json['endedAt'] as String),
  durationSec: (json['durationSec'] as num?)?.toInt(),
);

Map<String, dynamic> _$CallDtoToJson(CallDto instance) => <String, dynamic>{
  'id': instance.id,
  'conversationId': instance.conversationId,
  'callerId': instance.callerId,
  'calleeId': instance.calleeId,
  'status': instance.status.toJson(),
  'outgoing': instance.outgoing,
  'peer': instance.peer.toJson(),
  'createdAt': instance.createdAt.toIso8601String(),
  'answeredAt': ?instance.answeredAt?.toIso8601String(),
  'endedAt': ?instance.endedAt?.toIso8601String(),
  'durationSec': ?instance.durationSec,
};
