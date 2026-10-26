// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reward_award_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RewardAwardListEnvelope _$RewardAwardListEnvelopeFromJson(
  Map<String, dynamic> json,
) => RewardAwardListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => RewardAwardDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$RewardAwardListEnvelopeToJson(
  RewardAwardListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
