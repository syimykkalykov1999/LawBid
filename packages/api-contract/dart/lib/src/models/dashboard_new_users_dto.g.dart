// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dashboard_new_users_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DashboardNewUsersDto _$DashboardNewUsersDtoFromJson(
  Map<String, dynamic> json,
) => DashboardNewUsersDto(
  clients24h: (json['clients24h'] as num).toInt(),
  attorneys24h: (json['attorneys24h'] as num).toInt(),
  clients7d: (json['clients7d'] as num).toInt(),
  attorneys7d: (json['attorneys7d'] as num).toInt(),
);

Map<String, dynamic> _$DashboardNewUsersDtoToJson(
  DashboardNewUsersDto instance,
) => <String, dynamic>{
  'clients24h': instance.clients24h,
  'attorneys24h': instance.attorneys24h,
  'clients7d': instance.clients7d,
  'attorneys7d': instance.attorneys7d,
};
