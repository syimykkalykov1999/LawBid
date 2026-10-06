// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'feed_preferences_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FeedPreferencesDto _$FeedPreferencesDtoFromJson(Map<String, dynamic> json) =>
    FeedPreferencesDto(
      contentMode: FeedContentMode.fromJson(json['contentMode'] as String),
    );

Map<String, dynamic> _$FeedPreferencesDtoToJson(FeedPreferencesDto instance) =>
    <String, dynamic>{'contentMode': instance.contentMode.toJson()};
