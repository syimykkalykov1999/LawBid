// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_ai_summary_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffAiSummaryEnvelope _$StaffAiSummaryEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffAiSummaryEnvelope(
  data: StaffAiSummaryDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffAiSummaryEnvelopeToJson(
  StaffAiSummaryEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
