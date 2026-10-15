// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_counters_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostCountersDto _$PostCountersDtoFromJson(Map<String, dynamic> json) =>
    PostCountersDto(
      hideLikes: json['hideLikes'] as bool?,
      hideViews: json['hideViews'] as bool?,
    );

Map<String, dynamic> _$PostCountersDtoToJson(PostCountersDto instance) =>
    <String, dynamic>{
      'hideLikes': ?instance.hideLikes,
      'hideViews': ?instance.hideViews,
    };
