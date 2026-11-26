// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reel_watch_item_dto.g.dart';

@JsonSerializable()
class ReelWatchItemDto {
  const ReelWatchItemDto({
    required this.postId,
    required this.viewId,
    required this.watchedMs,
    required this.completed,
    this.durationMs,
  });

  factory ReelWatchItemDto.fromJson(Map<String, Object?> json) =>
      _$ReelWatchItemDtoFromJson(json);

  final String postId;

  /// The app’s id of this view; the same id again (a retry) is counted once.
  final String viewId;

  /// Real playback in ms (paused, buffering and off-screen time excluded).
  final num watchedMs;

  /// The clip’s length in ms (0 or absent = unknown).
  final num? durationMs;

  /// The clip played to its end at least once in this view.
  final bool completed;

  Map<String, Object?> toJson() => _$ReelWatchItemDtoToJson(this);
}
