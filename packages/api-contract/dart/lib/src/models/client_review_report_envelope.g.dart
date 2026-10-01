// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_review_report_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientReviewReportEnvelope _$ClientReviewReportEnvelopeFromJson(
  Map<String, dynamic> json,
) => ClientReviewReportEnvelope(
  data: ClientReviewReportDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ClientReviewReportEnvelopeToJson(
  ClientReviewReportEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
