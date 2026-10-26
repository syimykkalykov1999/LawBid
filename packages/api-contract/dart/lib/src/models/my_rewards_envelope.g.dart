// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'my_rewards_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MyRewardsEnvelope _$MyRewardsEnvelopeFromJson(Map<String, dynamic> json) =>
    MyRewardsEnvelope(
      data: MyRewardsDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$MyRewardsEnvelopeToJson(MyRewardsEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
