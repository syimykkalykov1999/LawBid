// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_sentry_issue_dto.g.dart';

@JsonSerializable()
class StaffSentryIssueDto {
  const StaffSentryIssueDto({
    required this.id,
    required this.title,
    required this.count,
    required this.users,
    required this.firstSeen,
    required this.lastSeen,
    required this.permalink,
  });

  factory StaffSentryIssueDto.fromJson(Map<String, Object?> json) =>
      _$StaffSentryIssueDtoFromJson(json);

  final String id;
  final String title;
  final int count;
  final int users;
  final String firstSeen;
  final String lastSeen;
  final String permalink;

  Map<String, Object?> toJson() => _$StaffSentryIssueDtoToJson(this);
}
