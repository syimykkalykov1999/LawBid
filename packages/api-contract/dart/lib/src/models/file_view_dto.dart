// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'file_view_dto.g.dart';

@JsonSerializable()
class FileViewDto {
  const FileViewDto({
    required this.id,
    required this.viewerUserId,
    required this.viewerName,
    required this.viewerAvatarUrl,
    required this.viewerRole,
    required this.viewedAt,
    required this.device,
    required this.platform,
    required this.ip,
  });

  factory FileViewDto.fromJson(Map<String, Object?> json) =>
      _$FileViewDtoFromJson(json);

  /// Journal row id (the client merges and de-duplicates by it).
  final String id;
  final String viewerUserId;
  final String? viewerName;

  /// Signed link to the viewer avatar, when they have a clean one.
  final String? viewerAvatarUrl;

  /// client | attorney | assistant (the viewer account role).
  final String? viewerRole;
  final DateTime viewedAt;

  /// Device name of the viewer session, when known.
  final String? device;
  final String? platform;

  /// The viewer address with its host part hidden (203.0.113.x / 2001:db8:1::x); the full address never leaves the server.
  final String? ip;

  Map<String, Object?> toJson() => _$FileViewDtoToJson(this);
}
