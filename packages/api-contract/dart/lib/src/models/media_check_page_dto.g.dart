// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'media_check_page_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MediaCheckPageDto _$MediaCheckPageDtoFromJson(Map<String, dynamic> json) =>
    MediaCheckPageDto(
      items: (json['items'] as List<dynamic>)
          .map((e) => MediaCheckDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      nextCursor: json['nextCursor'] as String?,
    );

Map<String, dynamic> _$MediaCheckPageDtoToJson(MediaCheckPageDto instance) =>
    <String, dynamic>{
      'items': instance.items.map((e) => e.toJson()).toList(),
      'nextCursor': ?instance.nextCursor,
    };
