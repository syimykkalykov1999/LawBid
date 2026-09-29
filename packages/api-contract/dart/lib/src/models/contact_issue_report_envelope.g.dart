// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contact_issue_report_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContactIssueReportEnvelope _$ContactIssueReportEnvelopeFromJson(
  Map<String, dynamic> json,
) => ContactIssueReportEnvelope(
  data: ContactIssueReportDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ContactIssueReportEnvelopeToJson(
  ContactIssueReportEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
