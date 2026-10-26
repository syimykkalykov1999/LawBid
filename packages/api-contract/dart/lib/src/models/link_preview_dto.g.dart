// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'link_preview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LinkPreviewDto _$LinkPreviewDtoFromJson(Map<String, dynamic> json) =>
    LinkPreviewDto(
      url: json['url'] as String,
      title: json['title'] as String?,
      description: json['description'] as String?,
      imageUrl: json['imageUrl'] as String?,
      siteName: json['siteName'] as String?,
    );

Map<String, dynamic> _$LinkPreviewDtoToJson(LinkPreviewDto instance) =>
    <String, dynamic>{
      'url': instance.url,
      'title': ?instance.title,
      'description': ?instance.description,
      'imageUrl': ?instance.imageUrl,
      'siteName': ?instance.siteName,
    };
