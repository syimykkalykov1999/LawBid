// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_hotline_addon_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SetHotlineAddonDto _$SetHotlineAddonDtoFromJson(Map<String, dynamic> json) =>
    SetHotlineAddonDto(
      enabled: json['enabled'] as bool,
      prorationDate: (json['prorationDate'] as num?)?.toInt(),
    );

Map<String, dynamic> _$SetHotlineAddonDtoToJson(SetHotlineAddonDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'prorationDate': ?instance.prorationDate,
    };
