// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contact_issue_resolution_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContactIssueResolutionEnvelope _$ContactIssueResolutionEnvelopeFromJson(
  Map<String, dynamic> json,
) => ContactIssueResolutionEnvelope(
  data: ContactIssueResolutionDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ContactIssueResolutionEnvelopeToJson(
  ContactIssueResolutionEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
