// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_contact_issue_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminContactIssueListEnvelope _$AdminContactIssueListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminContactIssueListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminContactIssueDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminContactIssueListEnvelopeToJson(
  AdminContactIssueListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
