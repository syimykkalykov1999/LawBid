// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'channel_media_dto.g.dart';

@JsonSerializable()
class ChannelMediaDto {
  const ChannelMediaDto({
    required this.fileId,
    required this.url,
    required this.previewUrl,
  });

  factory ChannelMediaDto.fromJson(Map<String, Object?> json) =>
      _$ChannelMediaDtoFromJson(json);

  final String fileId;
  final String url;
  final String previewUrl;

  Map<String, Object?> toJson() => _$ChannelMediaDtoToJson(this);
}
