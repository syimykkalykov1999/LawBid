// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_event_count_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AppEventCountDto _$AppEventCountDtoFromJson(Map<String, dynamic> json) =>
    AppEventCountDto(
      name: json['name'] as String,
      screen: json['screen'] as String,
      count: json['count'] as num,
    );

Map<String, dynamic> _$AppEventCountDtoToJson(AppEventCountDto instance) =>
    <String, dynamic>{
      'name': instance.name,
      'screen': instance.screen,
      'count': instance.count,
    };
