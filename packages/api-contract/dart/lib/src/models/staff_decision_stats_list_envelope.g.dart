// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_decision_stats_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffDecisionStatsListEnvelope _$StaffDecisionStatsListEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffDecisionStatsListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => StaffDecisionStatsDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffDecisionStatsListEnvelopeToJson(
  StaffDecisionStatsListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
