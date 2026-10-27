// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'desk_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeskSettingsDto _$DeskSettingsDtoFromJson(Map<String, dynamic> json) =>
    DeskSettingsDto(
      switches: Map<String, bool>.from(json['switches'] as Map),
      numbers: Map<String, int>.from(json['numbers'] as Map),
    );

Map<String, dynamic> _$DeskSettingsDtoToJson(DeskSettingsDto instance) =>
    <String, dynamic>{
      'switches': instance.switches,
      'numbers': instance.numbers,
    };
