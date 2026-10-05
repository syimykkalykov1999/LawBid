// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_lead_detail_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachLeadDetailEnvelope _$OutreachLeadDetailEnvelopeFromJson(
  Map<String, dynamic> json,
) => OutreachLeadDetailEnvelope(
  data: OutreachLeadDetailDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OutreachLeadDetailEnvelopeToJson(
  OutreachLeadDetailEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
