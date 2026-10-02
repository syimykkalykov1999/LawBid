// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'video_upload_dto.g.dart';

@JsonSerializable()
class VideoUploadDto {
  const VideoUploadDto({
    required this.videoAssetId,
    required this.tusEndpoint,
    required this.libraryId,
    required this.videoId,
    required this.authorizationSignature,
    required this.authorizationExpire,
    required this.maxDurationSec,
  });

  factory VideoUploadDto.fromJson(Map<String, Object?> json) =>
      _$VideoUploadDtoFromJson(json);

  final String videoAssetId;
  final String tusEndpoint;
  final String libraryId;
  final String videoId;
  final String authorizationSignature;

  /// Unix seconds.
  final int authorizationExpire;
  final int maxDurationSec;

  Map<String, Object?> toJson() => _$VideoUploadDtoToJson(this);
}
