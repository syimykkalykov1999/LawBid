// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_task_event_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseTaskEventDto _$CaseTaskEventDtoFromJson(Map<String, dynamic> json) =>
    CaseTaskEventDto(
      id: json['id'] as String,
      type: CaseTaskEventDtoType.fromJson(json['type'] as String),
      actorRole: CaseTaskEventDtoActorRole.fromJson(
        json['actorRole'] as String,
      ),
      fileCount: (json['fileCount'] as num).toInt(),
      at: json['at'] as String,
      note: json['note'] as String?,
    );

Map<String, dynamic> _$CaseTaskEventDtoToJson(CaseTaskEventDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'type': instance.type.toJson(),
      'actorRole': instance.actorRole.toJson(),
      'note': ?instance.note,
      'fileCount': instance.fileCount,
      'at': instance.at,
    };
