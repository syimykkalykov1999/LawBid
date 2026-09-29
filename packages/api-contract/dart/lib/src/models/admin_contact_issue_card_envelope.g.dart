// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_contact_issue_card_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminContactIssueCardEnvelope _$AdminContactIssueCardEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminContactIssueCardEnvelope(
  data: AdminContactIssueCardDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminContactIssueCardEnvelopeToJson(
  AdminContactIssueCardEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
