// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'channel_views_dto.g.dart';

@JsonSerializable()
class ChannelViewsDto {
  const ChannelViewsDto({required this.postIds});

  factory ChannelViewsDto.fromJson(Map<String, Object?> json) =>
      _$ChannelViewsDtoFromJson(json);

  final List<String> postIds;

  Map<String, Object?> toJson() => _$ChannelViewsDtoToJson(this);
}
