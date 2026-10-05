// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'storage_cleanup_result_dto.g.dart';

@JsonSerializable()
class StorageCleanupResultDto {
  const StorageCleanupResultDto({
    required this.pendingUploadsRemoved,
    required this.orphansFound,
    required this.deletedPostMedia,
    required this.restored,
    required this.objectsRemoved,
    required this.rowsRemoved,
  });

  factory StorageCleanupResultDto.fromJson(Map<String, Object?> json) =>
      _$StorageCleanupResultDtoFromJson(json);

  final num pendingUploadsRemoved;
  final num orphansFound;
  final num deletedPostMedia;
  final num restored;
  final num objectsRemoved;
  final num rowsRemoved;

  Map<String, Object?> toJson() => _$StorageCleanupResultDtoToJson(this);
}
