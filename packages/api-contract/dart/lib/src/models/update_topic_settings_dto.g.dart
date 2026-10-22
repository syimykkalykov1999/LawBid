// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_topic_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateTopicSettingsDto _$UpdateTopicSettingsDtoFromJson(
  Map<String, dynamic> json,
) => UpdateTopicSettingsDto(
  items: (json['items'] as List<dynamic>)
      .map((e) => TopicSettingDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$UpdateTopicSettingsDtoToJson(
  UpdateTopicSettingsDto instance,
) => <String, dynamic>{'items': instance.items.map((e) => e.toJson()).toList()};
