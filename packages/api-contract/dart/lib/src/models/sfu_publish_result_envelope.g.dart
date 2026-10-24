// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_publish_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuPublishResultEnvelope _$SfuPublishResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => SfuPublishResultEnvelope(
  data: SfuPublishResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SfuPublishResultEnvelopeToJson(
  SfuPublishResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
