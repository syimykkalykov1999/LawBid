// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'move_plan_subscribers_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MovePlanSubscribersResultEnvelope _$MovePlanSubscribersResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => MovePlanSubscribersResultEnvelope(
  data: MovePlanSubscribersResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MovePlanSubscribersResultEnvelopeToJson(
  MovePlanSubscribersResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
