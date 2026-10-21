// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_channel_post_dto.g.dart';

@JsonSerializable()
class CreateChannelPostDto {
  const CreateChannelPostDto({this.body, this.mediaFileIds, this.videoAssetId});

  factory CreateChannelPostDto.fromJson(Map<String, Object?> json) =>
      _$CreateChannelPostDtoFromJson(json);

  final String? body;
  final List<String>? mediaFileIds;
  final String? videoAssetId;

  Map<String, Object?> toJson() => _$CreateChannelPostDtoToJson(this);
}
