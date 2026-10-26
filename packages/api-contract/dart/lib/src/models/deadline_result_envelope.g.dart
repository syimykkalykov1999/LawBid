// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deadline_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeadlineResultEnvelope _$DeadlineResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => DeadlineResultEnvelope(
  data: DeadlineResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DeadlineResultEnvelopeToJson(
  DeadlineResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
