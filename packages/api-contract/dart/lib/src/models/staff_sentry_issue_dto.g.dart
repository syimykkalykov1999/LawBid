// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_sentry_issue_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffSentryIssueDto _$StaffSentryIssueDtoFromJson(Map<String, dynamic> json) =>
    StaffSentryIssueDto(
      id: json['id'] as String,
      title: json['title'] as String,
      count: (json['count'] as num).toInt(),
      users: (json['users'] as num).toInt(),
      firstSeen: json['firstSeen'] as String,
      lastSeen: json['lastSeen'] as String,
      permalink: json['permalink'] as String,
    );

Map<String, dynamic> _$StaffSentryIssueDtoToJson(
  StaffSentryIssueDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'title': instance.title,
  'count': instance.count,
  'users': instance.users,
  'firstSeen': instance.firstSeen,
  'lastSeen': instance.lastSeen,
  'permalink': instance.permalink,
};
