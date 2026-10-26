// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_subscribe_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuSubscribeResultEnvelope _$SfuSubscribeResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => SfuSubscribeResultEnvelope(
  data: SfuSubscribeResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SfuSubscribeResultEnvelopeToJson(
  SfuSubscribeResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
