// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'file_view_dto.g.dart';

@JsonSerializable()
class FileViewDto {
  const FileViewDto({
    required this.viewerUserId,
    required this.viewerName,
    required this.viewedAt,
    required this.device,
    required this.platform,
    required this.ip,
  });

  factory FileViewDto.fromJson(Map<String, Object?> json) =>
      _$FileViewDtoFromJson(json);

  final String viewerUserId;
  final String? viewerName;
  final DateTime viewedAt;

  /// Device name of the viewer session, when known.
  final String? device;
  final String? platform;
  final String? ip;

  Map<String, Object?> toJson() => _$FileViewDtoToJson(this);
}
