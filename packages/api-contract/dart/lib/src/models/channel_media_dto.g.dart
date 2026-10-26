// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_media_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelMediaDto _$ChannelMediaDtoFromJson(Map<String, dynamic> json) =>
    ChannelMediaDto(
      fileId: json['fileId'] as String,
      url: json['url'] as String,
      previewUrl: json['previewUrl'] as String,
    );

Map<String, dynamic> _$ChannelMediaDtoToJson(ChannelMediaDto instance) =>
    <String, dynamic>{
      'fileId': instance.fileId,
      'url': instance.url,
      'previewUrl': instance.previewUrl,
    };
