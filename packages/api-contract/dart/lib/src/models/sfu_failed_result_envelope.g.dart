// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_failed_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuFailedResultEnvelope _$SfuFailedResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => SfuFailedResultEnvelope(
  data: SfuFailedResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SfuFailedResultEnvelopeToJson(
  SfuFailedResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
