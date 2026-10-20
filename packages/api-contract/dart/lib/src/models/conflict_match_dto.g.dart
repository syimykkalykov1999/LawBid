// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conflict_match_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConflictMatchDto _$ConflictMatchDtoFromJson(Map<String, dynamic> json) =>
    ConflictMatchDto(
      kind: ConflictMatchDtoKind.fromJson(json['kind'] as String),
      caseId: json['caseId'] as String,
      caseTitle: json['caseTitle'] as String,
      by: json['by'] == null
          ? null
          : ConflictMatchDtoBy.fromJson(json['by'] as String),
    );

Map<String, dynamic> _$ConflictMatchDtoToJson(ConflictMatchDto instance) =>
    <String, dynamic>{
      'kind': instance.kind.toJson(),
      'by': ?instance.by?.toJson(),
      'caseId': instance.caseId,
      'caseTitle': instance.caseTitle,
    };
