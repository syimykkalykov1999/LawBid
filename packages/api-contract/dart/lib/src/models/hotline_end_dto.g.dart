// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_end_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineEndDto _$HotlineEndDtoFromJson(Map<String, dynamic> json) =>
    HotlineEndDto(
      ok: json['ok'] as bool,
      seconds: json['seconds'] as num,
      conversationId: json['conversationId'] as String?,
    );

Map<String, dynamic> _$HotlineEndDtoToJson(HotlineEndDto instance) =>
    <String, dynamic>{
      'ok': instance.ok,
      'seconds': instance.seconds,
      'conversationId': ?instance.conversationId,
    };
