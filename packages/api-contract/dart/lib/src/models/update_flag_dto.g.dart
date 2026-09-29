// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_flag_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateFlagDto _$UpdateFlagDtoFromJson(Map<String, dynamic> json) =>
    UpdateFlagDto(
      enabled: json['enabled'] as bool?,
      rolloutPercent: (json['rolloutPercent'] as num?)?.toInt(),
    );

Map<String, dynamic> _$UpdateFlagDtoToJson(UpdateFlagDto instance) =>
    <String, dynamic>{
      'enabled': ?instance.enabled,
      'rolloutPercent': ?instance.rolloutPercent,
    };
