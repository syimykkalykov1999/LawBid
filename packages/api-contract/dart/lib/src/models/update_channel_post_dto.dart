// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_channel_post_dto.g.dart';

@JsonSerializable()
class UpdateChannelPostDto {
  const UpdateChannelPostDto({required this.body});

  factory UpdateChannelPostDto.fromJson(Map<String, Object?> json) =>
      _$UpdateChannelPostDtoFromJson(json);

  final String body;

  Map<String, Object?> toJson() => _$UpdateChannelPostDtoToJson(this);
}
