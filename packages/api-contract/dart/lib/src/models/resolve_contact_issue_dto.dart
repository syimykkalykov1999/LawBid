// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'resolve_contact_issue_dto_decision.dart';

part 'resolve_contact_issue_dto.g.dart';

@JsonSerializable()
class ResolveContactIssueDto {
  const ResolveContactIssueDto({required this.decision, required this.note});

  factory ResolveContactIssueDto.fromJson(Map<String, Object?> json) =>
      _$ResolveContactIssueDtoFromJson(json);

  final ResolveContactIssueDtoDecision decision;
  final String note;

  Map<String, Object?> toJson() => _$ResolveContactIssueDtoToJson(this);
}
