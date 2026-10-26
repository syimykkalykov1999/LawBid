// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reward_award_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RewardAwardEnvelope _$RewardAwardEnvelopeFromJson(Map<String, dynamic> json) =>
    RewardAwardEnvelope(
      data: RewardAwardDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$RewardAwardEnvelopeToJson(
  RewardAwardEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
