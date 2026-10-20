// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_channel_post_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateChannelPostDto _$CreateChannelPostDtoFromJson(
  Map<String, dynamic> json,
) => CreateChannelPostDto(
  body: json['body'] as String?,
  mediaFileIds: (json['mediaFileIds'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  videoAssetId: json['videoAssetId'] as String?,
);

Map<String, dynamic> _$CreateChannelPostDtoToJson(
  CreateChannelPostDto instance,
) => <String, dynamic>{
  'body': ?instance.body,
  'mediaFileIds': ?instance.mediaFileIds,
  'videoAssetId': ?instance.videoAssetId,
};
