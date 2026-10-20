// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'running_timer_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RunningTimerEnvelope _$RunningTimerEnvelopeFromJson(
  Map<String, dynamic> json,
) => RunningTimerEnvelope(
  data: RunningTimerDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$RunningTimerEnvelopeToJson(
  RunningTimerEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
