// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_cases_filter_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCasesFilterDto _$AdminCasesFilterDtoFromJson(Map<String, dynamic> json) =>
    AdminCasesFilterDto(
      status: json['status'] == null
          ? null
          : AdminCaseStatus.fromJson(json['status'] as String),
      q: json['q'] as String?,
      clientId: json['clientId'] as String?,
      practiceAreaId: json['practiceAreaId'] as String?,
      stateCode: json['stateCode'] as String?,
      hasReports: json['hasReports'] as bool?,
      withDeadline: json['withDeadline'] as bool?,
    );

Map<String, dynamic> _$AdminCasesFilterDtoToJson(
  AdminCasesFilterDto instance,
) => <String, dynamic>{
  'status': ?instance.status?.toJson(),
  'q': ?instance.q,
  'clientId': ?instance.clientId,
  'practiceAreaId': ?instance.practiceAreaId,
  'stateCode': ?instance.stateCode,
  'hasReports': ?instance.hasReports,
  'withDeadline': ?instance.withDeadline,
};
