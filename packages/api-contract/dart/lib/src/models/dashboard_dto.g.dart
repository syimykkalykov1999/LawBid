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
  invites24h: (json['invites24h'] as num).toInt(),
  openReports: (json['openReports'] as num).toInt(),
  openDisputes: (json['openDisputes'] as num).toInt(),
  openContactIssues: (json['openContactIssues'] as num).toInt(),
  seatLimitRequests: (json['seatLimitRequests'] as num).toInt(),
  fraudQueue: (json['fraudQueue'] as num).toInt(),
  fraudBlocked7d: (json['fraudBlocked7d'] as num).toInt(),
  computedAt: DateTime.parse(json['computedAt'] as String),
);

Map<String, dynamic> _$DashboardDtoToJson(DashboardDto instance) =>
    <String, dynamic>{
      'newUsers': instance.newUsers.toJson(),
      'verification': instance.verification.toJson(),
      'subscriptions': instance.subscriptions.toJson(),
      'openCases': instance.openCases,
      'bids24h': instance.bids24h,
      'invites24h': instance.invites24h,
      'openReports': instance.openReports,
      'openDisputes': instance.openDisputes,
      'openContactIssues': instance.openContactIssues,
      'seatLimitRequests': instance.seatLimitRequests,
      'fraudQueue': instance.fraudQueue,
      'fraudBlocked7d': instance.fraudBlocked7d,
      'computedAt': instance.computedAt.toIso8601String(),
    };
