// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_history_export_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseHistoryExportDto _$CaseHistoryExportDtoFromJson(
  Map<String, dynamic> json,
) => CaseHistoryExportDto(
  exportId: json['exportId'] as String,
  status: CaseHistoryExportDtoStatus.fromJson(json['status'] as String),
  url: json['url'] as String?,
  expiresAt: json['expiresAt'] as String?,
);

Map<String, dynamic> _$CaseHistoryExportDtoToJson(
  CaseHistoryExportDto instance,
) => <String, dynamic>{
  'exportId': instance.exportId,
  'status': instance.status.toJson(),
  'url': ?instance.url,
  'expiresAt': ?instance.expiresAt,
};
