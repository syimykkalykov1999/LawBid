// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'storage_cleanup_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StorageCleanupResultDto _$StorageCleanupResultDtoFromJson(
  Map<String, dynamic> json,
) => StorageCleanupResultDto(
  pendingUploadsRemoved: json['pendingUploadsRemoved'] as num,
  orphansFound: json['orphansFound'] as num,
  deletedPostMedia: json['deletedPostMedia'] as num,
  restored: json['restored'] as num,
  objectsRemoved: json['objectsRemoved'] as num,
  rowsRemoved: json['rowsRemoved'] as num,
);

Map<String, dynamic> _$StorageCleanupResultDtoToJson(
  StorageCleanupResultDto instance,
) => <String, dynamic>{
  'pendingUploadsRemoved': instance.pendingUploadsRemoved,
  'orphansFound': instance.orphansFound,
  'deletedPostMedia': instance.deletedPostMedia,
  'restored': instance.restored,
  'objectsRemoved': instance.objectsRemoved,
  'rowsRemoved': instance.rowsRemoved,
};
