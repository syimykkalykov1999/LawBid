// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_ice_server_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuIceServerDto _$SfuIceServerDtoFromJson(Map<String, dynamic> json) =>
    SfuIceServerDto(
      urls: (json['urls'] as List<dynamic>).map((e) => e as String).toList(),
    );

Map<String, dynamic> _$SfuIceServerDtoToJson(SfuIceServerDto instance) =>
    <String, dynamic>{'urls': instance.urls};
