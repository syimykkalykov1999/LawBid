// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ad_archive_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdArchiveRowDto _$AdArchiveRowDtoFromJson(Map<String, dynamic> json) =>
    AdArchiveRowDto(
      id: json['id'] as String,
      attorneyId: json['attorneyId'] as String,
      kind: AdArchiveRowDtoKind.fromJson(json['kind'] as String),
      sourceId: json['sourceId'] as String,
      version: (json['version'] as num).toInt(),
      content: json['content'] as String,
      disclaimers: (json['disclaimers'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      findings: (json['findings'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      stateCodes: (json['stateCodes'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      retainUntil: DateTime.parse(json['retainUntil'] as String),
    );

Map<String, dynamic> _$AdArchiveRowDtoToJson(AdArchiveRowDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'attorneyId': instance.attorneyId,
      'kind': instance.kind.toJson(),
      'sourceId': instance.sourceId,
      'version': instance.version,
      'content': instance.content,
      'disclaimers': instance.disclaimers,
      'findings': instance.findings,
      'stateCodes': instance.stateCodes,
      'createdAt': instance.createdAt.toIso8601String(),
      'retainUntil': instance.retainUntil.toIso8601String(),
    };
