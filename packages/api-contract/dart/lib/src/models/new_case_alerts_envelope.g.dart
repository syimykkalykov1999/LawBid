// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'new_case_alerts_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NewCaseAlertsEnvelope _$NewCaseAlertsEnvelopeFromJson(
  Map<String, dynamic> json,
) => NewCaseAlertsEnvelope(
  data: NewCaseAlertsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$NewCaseAlertsEnvelopeToJson(
  NewCaseAlertsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
