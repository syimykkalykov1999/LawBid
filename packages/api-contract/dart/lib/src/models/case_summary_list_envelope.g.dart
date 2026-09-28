// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_summary_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseSummaryListEnvelope _$CaseSummaryListEnvelopeFromJson(
  Map<String, dynamic> json,
) => CaseSummaryListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => CaseSummaryDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CaseSummaryListEnvelopeToJson(
  CaseSummaryListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
