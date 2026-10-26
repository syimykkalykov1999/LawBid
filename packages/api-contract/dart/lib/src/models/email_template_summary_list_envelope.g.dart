// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'email_template_summary_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EmailTemplateSummaryListEnvelope _$EmailTemplateSummaryListEnvelopeFromJson(
  Map<String, dynamic> json,
) => EmailTemplateSummaryListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => EmailTemplateSummaryDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$EmailTemplateSummaryListEnvelopeToJson(
  EmailTemplateSummaryListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
