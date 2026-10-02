// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_support_status_counts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSupportStatusCountsDto _$AdminSupportStatusCountsDtoFromJson(
  Map<String, dynamic> json,
) => AdminSupportStatusCountsDto(
  open: json['open'] as num,
  waitingUser: json['waiting_user'] as num,
  resolved: json['resolved'] as num,
  closed: json['closed'] as num,
);

Map<String, dynamic> _$AdminSupportStatusCountsDtoToJson(
  AdminSupportStatusCountsDto instance,
) => <String, dynamic>{
  'open': instance.open,
  'waiting_user': instance.waitingUser,
  'resolved': instance.resolved,
  'closed': instance.closed,
};
