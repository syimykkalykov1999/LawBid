// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_lead_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachLeadRowListEnvelope _$OutreachLeadRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => OutreachLeadRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => OutreachLeadRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OutreachLeadRowListEnvelopeToJson(
  OutreachLeadRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
