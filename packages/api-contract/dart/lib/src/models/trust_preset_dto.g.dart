// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_preset_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustPresetDto _$TrustPresetDtoFromJson(Map<String, dynamic> json) =>
    TrustPresetDto(
      preset: TrustPresetDtoPreset.fromJson(json['preset'] as String),
    );

Map<String, dynamic> _$TrustPresetDtoToJson(TrustPresetDto instance) =>
    <String, dynamic>{'preset': instance.preset.toJson()};
