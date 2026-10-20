// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'my_report_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MyReportListEnvelope _$MyReportListEnvelopeFromJson(
  Map<String, dynamic> json,
) => MyReportListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => MyReportDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MyReportListEnvelopeToJson(
  MyReportListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
