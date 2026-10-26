// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dashboard_role_totals_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DashboardRoleTotalsDto _$DashboardRoleTotalsDtoFromJson(
  Map<String, dynamic> json,
) => DashboardRoleTotalsDto(
  total: (json['total'] as num).toInt(),
  active: (json['active'] as num).toInt(),
  verified: (json['verified'] as num?)?.toInt(),
);

Map<String, dynamic> _$DashboardRoleTotalsDtoToJson(
  DashboardRoleTotalsDto instance,
) => <String, dynamic>{
  'total': instance.total,
  'active': instance.active,
  'verified': ?instance.verified,
};
