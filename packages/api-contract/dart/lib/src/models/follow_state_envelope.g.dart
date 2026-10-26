// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'follow_state_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FollowStateEnvelope _$FollowStateEnvelopeFromJson(Map<String, dynamic> json) =>
    FollowStateEnvelope(
      data: FollowStateDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$FollowStateEnvelopeToJson(
  FollowStateEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
