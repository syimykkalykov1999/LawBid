// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_cases_bulk_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCasesBulkDto _$AdminCasesBulkDtoFromJson(Map<String, dynamic> json) =>
    AdminCasesBulkDto(
      action: AdminCasesBulkAction.fromJson(json['action'] as String),
      ids: (json['ids'] as List<dynamic>?)?.map((e) => e as String).toList(),
      filter: json['filter'] == null
          ? null
          : AdminCasesFilterDto.fromJson(
              json['filter'] as Map<String, dynamic>,
            ),
      reason: json['reason'] as String? ?? '',
    );

Map<String, dynamic> _$AdminCasesBulkDtoToJson(AdminCasesBulkDto instance) =>
    <String, dynamic>{
      'reason': instance.reason,
      'action': instance.action.toJson(),
      'ids': ?instance.ids,
      'filter': ?instance.filter?.toJson(),
    };
