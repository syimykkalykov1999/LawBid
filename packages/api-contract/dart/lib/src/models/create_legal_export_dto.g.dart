// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_legal_export_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateLegalExportDto _$CreateLegalExportDtoFromJson(
  Map<String, dynamic> json,
) => CreateLegalExportDto(
  userId: json['userId'] as String,
  sections: (json['sections'] as List<dynamic>)
      .map((e) => CreateLegalExportDtoSections.fromJson(e as String))
      .toList(),
  conversationIds: (json['conversationIds'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  groupIds: (json['groupIds'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  dateFrom: json['dateFrom'] == null
      ? null
      : DateTime.parse(json['dateFrom'] as String),
  dateTo: json['dateTo'] == null
      ? null
      : DateTime.parse(json['dateTo'] as String),
);

Map<String, dynamic> _$CreateLegalExportDtoToJson(
  CreateLegalExportDto instance,
) => <String, dynamic>{
  'userId': instance.userId,
  'sections': instance.sections.map((e) => e.toJson()).toList(),
  'conversationIds': ?instance.conversationIds,
  'groupIds': ?instance.groupIds,
  'dateFrom': ?instance.dateFrom?.toIso8601String(),
  'dateTo': ?instance.dateTo?.toIso8601String(),
};
