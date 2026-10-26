// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'feed_content_mode.dart';

part 'feed_preferences_dto.g.dart';

@JsonSerializable()
class FeedPreferencesDto {
  const FeedPreferencesDto({required this.contentMode});

  factory FeedPreferencesDto.fromJson(Map<String, Object?> json) =>
      _$FeedPreferencesDtoFromJson(json);

  final FeedContentMode contentMode;

  Map<String, Object?> toJson() => _$FeedPreferencesDtoToJson(this);
}
