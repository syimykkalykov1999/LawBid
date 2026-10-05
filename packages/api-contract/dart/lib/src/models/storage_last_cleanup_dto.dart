// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'storage_last_cleanup_dto.g.dart';

@JsonSerializable()
class StorageLastCleanupDto {
  const StorageLastCleanupDto({
    required this.pendingUploadsRemoved,
    required this.orphansFound,
    required this.deletedPostMedia,
    required this.restored,
    required this.objectsRemoved,
    required this.rowsRemoved,
    required this.at,
  });

  factory StorageLastCleanupDto.fromJson(Map<String, Object?> json) =>
      _$StorageLastCleanupDtoFromJson(json);

  final num pendingUploadsRemoved;
  final num orphansFound;
  final num deletedPostMedia;
  final num restored;
  final num objectsRemoved;
  final num rowsRemoved;
  final DateTime at;

  Map<String, Object?> toJson() => _$StorageLastCleanupDtoToJson(this);
}
