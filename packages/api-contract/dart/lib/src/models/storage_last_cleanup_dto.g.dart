// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'storage_last_cleanup_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StorageLastCleanupDto _$StorageLastCleanupDtoFromJson(
  Map<String, dynamic> json,
) => StorageLastCleanupDto(
  pendingUploadsRemoved: json['pendingUploadsRemoved'] as num,
  orphansFound: json['orphansFound'] as num,
  deletedPostMedia: json['deletedPostMedia'] as num,
  restored: json['restored'] as num,
  objectsRemoved: json['objectsRemoved'] as num,
  rowsRemoved: json['rowsRemoved'] as num,
  at: DateTime.parse(json['at'] as String),
);

Map<String, dynamic> _$StorageLastCleanupDtoToJson(
  StorageLastCleanupDto instance,
) => <String, dynamic>{
  'pendingUploadsRemoved': instance.pendingUploadsRemoved,
  'orphansFound': instance.orphansFound,
  'deletedPostMedia': instance.deletedPostMedia,
  'restored': instance.restored,
  'objectsRemoved': instance.objectsRemoved,
  'rowsRemoved': instance.rowsRemoved,
  'at': instance.at.toIso8601String(),
};
