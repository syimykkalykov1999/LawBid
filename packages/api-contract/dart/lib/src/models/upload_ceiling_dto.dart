// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'upload_ceiling_dto.g.dart';

@JsonSerializable()
class UploadCeilingDto {
  const UploadCeilingDto({
    required this.count,
    required this.fileMb,
    required this.totalMb,
  });

  factory UploadCeilingDto.fromJson(Map<String, Object?> json) =>
      _$UploadCeilingDtoFromJson(json);

  /// Most photos / files an admin may allow.
  final num count;

  /// Most MB per file an admin may allow.
  final num fileMb;

  /// Most MB of documents together.
  final num totalMb;

  Map<String, Object?> toJson() => _$UploadCeilingDtoToJson(this);
}
