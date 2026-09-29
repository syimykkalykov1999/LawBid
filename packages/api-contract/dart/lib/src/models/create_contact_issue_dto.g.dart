// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_contact_issue_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateContactIssueDto _$CreateContactIssueDtoFromJson(
  Map<String, dynamic> json,
) => CreateContactIssueDto(
  issueType: ContactIssueType.fromJson(json['issueType'] as String),
  note: json['note'] as String?,
);

Map<String, dynamic> _$CreateContactIssueDtoToJson(
  CreateContactIssueDto instance,
) => <String, dynamic>{
  'issueType': instance.issueType.toJson(),
  'note': ?instance.note,
};
