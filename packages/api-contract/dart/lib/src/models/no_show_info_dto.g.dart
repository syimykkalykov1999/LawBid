// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'no_show_info_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NoShowInfoDto _$NoShowInfoDtoFromJson(Map<String, dynamic> json) =>
    NoShowInfoDto(
      noShows: (json['noShows'] as List<dynamic>)
          .map((e) => NoShowDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      canMarkNoShow: json['canMarkNoShow'] as bool,
    );

Map<String, dynamic> _$NoShowInfoDtoToJson(NoShowInfoDto instance) =>
    <String, dynamic>{
      'noShows': instance.noShows.map((e) => e.toJson()).toList(),
      'canMarkNoShow': instance.canMarkNoShow,
    };
