// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_flag_decision_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffFlagDecisionResultEnvelope _$StaffFlagDecisionResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffFlagDecisionResultEnvelope(
  data: StaffFlagDecisionResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffFlagDecisionResultEnvelopeToJson(
  StaffFlagDecisionResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
