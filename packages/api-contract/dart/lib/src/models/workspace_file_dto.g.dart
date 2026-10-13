// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'workspace_file_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

WorkspaceFileDto _$WorkspaceFileDtoFromJson(Map<String, dynamic> json) =>
    WorkspaceFileDto(
      fileId: json['fileId'] as String,
      url: json['url'] as String,
      previewUrl: json['previewUrl'] as String,
      mime: json['mime'] as String,
      sizeBytes: (json['sizeBytes'] as num).toInt(),
      source: WorkspaceFileDtoSource.fromJson(json['source'] as String),
      sample: json['sample'] as bool,
      addedByRole: WorkspaceFileDtoAddedByRole.fromJson(
        json['addedByRole'] as String,
      ),
      addedAt: json['addedAt'] as String,
      description: json['description'] as String?,
      sourceTitle: json['sourceTitle'] as String?,
      sourceId: json['sourceId'] as String?,
      sourceItemId: json['sourceItemId'] as String?,
    );

Map<String, dynamic> _$WorkspaceFileDtoToJson(WorkspaceFileDto instance) =>
    <String, dynamic>{
      'fileId': instance.fileId,
      'url': instance.url,
      'previewUrl': instance.previewUrl,
      'mime': instance.mime,
      'sizeBytes': instance.sizeBytes,
      'description': ?instance.description,
      'source': instance.source.toJson(),
      'sourceTitle': ?instance.sourceTitle,
      'sourceId': ?instance.sourceId,
      'sourceItemId': ?instance.sourceItemId,
      'sample': instance.sample,
      'addedByRole': instance.addedByRole.toJson(),
      'addedAt': instance.addedAt,
    };
