// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_close_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuCloseResultEnvelope _$SfuCloseResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => SfuCloseResultEnvelope(
  data: SfuCloseResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SfuCloseResultEnvelopeToJson(
  SfuCloseResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
