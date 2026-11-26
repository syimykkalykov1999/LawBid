// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reel_watch_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReelWatchItemDto _$ReelWatchItemDtoFromJson(Map<String, dynamic> json) =>
    ReelWatchItemDto(
      postId: json['postId'] as String,
      viewId: json['viewId'] as String,
      watchedMs: json['watchedMs'] as num,
      completed: json['completed'] as bool,
      durationMs: json['durationMs'] as num?,
    );

Map<String, dynamic> _$ReelWatchItemDtoToJson(ReelWatchItemDto instance) =>
    <String, dynamic>{
      'postId': instance.postId,
      'viewId': instance.viewId,
      'watchedMs': instance.watchedMs,
      'durationMs': ?instance.durationMs,
      'completed': instance.completed,
    };
