// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dashboard_totals_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DashboardTotalsDto _$DashboardTotalsDtoFromJson(Map<String, dynamic> json) =>
    DashboardTotalsDto(
      clients: DashboardRoleTotalsDto.fromJson(
        json['clients'] as Map<String, dynamic>,
      ),
      attorneys: DashboardRoleTotalsDto.fromJson(
        json['attorneys'] as Map<String, dynamic>,
      ),
      assistants: DashboardRoleTotalsDto.fromJson(
        json['assistants'] as Map<String, dynamic>,
      ),
      admins: DashboardRoleTotalsDto.fromJson(
        json['admins'] as Map<String, dynamic>,
      ),
      all: DashboardRoleTotalsDto.fromJson(json['all'] as Map<String, dynamic>),
      computedAt: DateTime.parse(json['computedAt'] as String),
    );

Map<String, dynamic> _$DashboardTotalsDtoToJson(DashboardTotalsDto instance) =>
    <String, dynamic>{
      'clients': instance.clients.toJson(),
      'attorneys': instance.attorneys.toJson(),
      'assistants': instance.assistants.toJson(),
      'admins': instance.admins.toJson(),
      'all': instance.all.toJson(),
      'computedAt': instance.computedAt.toIso8601String(),
    };
