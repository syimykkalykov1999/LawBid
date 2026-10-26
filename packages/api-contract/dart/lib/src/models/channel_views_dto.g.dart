// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_views_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelViewsDto _$ChannelViewsDtoFromJson(Map<String, dynamic> json) =>
    ChannelViewsDto(
      postIds: (json['postIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$ChannelViewsDtoToJson(ChannelViewsDto instance) =>
    <String, dynamic>{'postIds': instance.postIds};
