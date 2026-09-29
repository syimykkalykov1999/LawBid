// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dashboard_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DashboardDto _$DashboardDtoFromJson(Map<String, dynamic> json) => DashboardDto(
  newUsers: DashboardNewUsersDto.fromJson(
    json['newUsers'] as Map<String, dynamic>,
  ),
  verification: DashboardVerificationDto.fromJson(
    json['verification'] as Map<String, dynamic>,
  ),
  subscriptions: DashboardSubscriptionsDto.fromJson(
    json['subscriptions'] as Map<String, dynamic>,
  ),
  openCases: (json['openCases'] as num).toInt(),
  bids24h: (json['bids24h'] as num).toInt(),
  openReports: (json['openReports'] as num).toInt(),
  openDisputes: (json['openDisputes'] as num).toInt(),
  openContactIssues: (json['openContactIssues'] as num).toInt(),
  computedAt: DateTime.parse(json['computedAt'] as String),
);

Map<String, dynamic> _$DashboardDtoToJson(DashboardDto instance) =>
    <String, dynamic>{
      'newUsers': instance.newUsers.toJson(),
      'verification': instance.verification.toJson(),
      'subscriptions': instance.subscriptions.toJson(),
      'openCases': instance.openCases,
      'bids24h': instance.bids24h,
      'openReports': instance.openReports,
      'openDisputes': instance.openDisputes,
      'openContactIssues': instance.openContactIssues,
      'computedAt': instance.computedAt.toIso8601String(),
    };
