// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_plan_me_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientPlanMeEnvelope _$ClientPlanMeEnvelopeFromJson(
  Map<String, dynamic> json,
) => ClientPlanMeEnvelope(
  data: ClientPlanMeDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ClientPlanMeEnvelopeToJson(
  ClientPlanMeEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
