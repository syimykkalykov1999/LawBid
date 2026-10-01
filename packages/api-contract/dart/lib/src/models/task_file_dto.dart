// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'task_file_dto.g.dart';

@JsonSerializable()
class TaskFileDto {
  const TaskFileDto({required this.fileId, this.url, this.mime});

  factory TaskFileDto.fromJson(Map<String, Object?> json) =>
      _$TaskFileDtoFromJson(json);

  final String fileId;
  final String? url;
  final String? mime;

  Map<String, Object?> toJson() => _$TaskFileDtoToJson(this);
}
