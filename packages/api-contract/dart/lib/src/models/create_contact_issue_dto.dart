// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contact_issue_type.dart';

part 'create_contact_issue_dto.g.dart';

@JsonSerializable()
class CreateContactIssueDto {
  const CreateContactIssueDto({required this.issueType, this.note});

  factory CreateContactIssueDto.fromJson(Map<String, Object?> json) =>
      _$CreateContactIssueDtoFromJson(json);

  final ContactIssueType issueType;
  final String? note;

  Map<String, Object?> toJson() => _$CreateContactIssueDtoToJson(this);
}
