// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_case_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCaseSummaryDto _$AdminCaseSummaryDtoFromJson(Map<String, dynamic> json) =>
    AdminCaseSummaryDto(
      id: json['id'] as String,
      title: json['title'] as String,
      status: json['status'] as String,
      stateCode: json['stateCode'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      client: json['client'] == null
          ? null
          : AdminPartyDto.fromJson(json['client'] as Map<String, dynamic>),
      attorney: json['attorney'] == null
          ? null
          : AdminPartyDto.fromJson(json['attorney'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AdminCaseSummaryDtoToJson(
  AdminCaseSummaryDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'title': instance.title,
  'status': instance.status,
  'stateCode': instance.stateCode,
  'createdAt': instance.createdAt.toIso8601String(),
  'client': ?instance.client?.toJson(),
  'attorney': ?instance.attorney?.toJson(),
};
