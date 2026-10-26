// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'live_kit_join_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LiveKitJoinEnvelope _$LiveKitJoinEnvelopeFromJson(Map<String, dynamic> json) =>
    LiveKitJoinEnvelope(
      data: LiveKitJoinDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$LiveKitJoinEnvelopeToJson(
  LiveKitJoinEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
