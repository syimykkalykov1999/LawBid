// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'entitlement_def_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EntitlementDefDto _$EntitlementDefDtoFromJson(Map<String, dynamic> json) =>
    EntitlementDefDto(
      key: EntitlementKey.fromJson(json['key'] as String),
      type: EntitlementDefDtoType.fromJson(json['type'] as String),
      audiences: (json['audiences'] as List<dynamic>)
          .map((e) => EntitlementDefDtoAudiences.fromJson(e as String))
          .toList(),
      group: json['group'] as String,
      label: LocalizedTextDto.fromJson(json['label'] as Map<String, dynamic>),
      description: LocalizedTextDto.fromJson(
        json['description'] as Map<String, dynamic>,
      ),
      min: (json['min'] as num?)?.toInt(),
      max: (json['max'] as num?)?.toInt(),
      zeroIsUnlimited: json['zeroIsUnlimited'] as bool?,
    );

Map<String, dynamic> _$EntitlementDefDtoToJson(EntitlementDefDto instance) =>
    <String, dynamic>{
      'key': instance.key.toJson(),
      'type': instance.type.toJson(),
      'audiences': instance.audiences.map((e) => e.toJson()).toList(),
      'group': instance.group,
      'label': instance.label.toJson(),
      'description': instance.description.toJson(),
      'min': ?instance.min,
      'max': ?instance.max,
      'zeroIsUnlimited': ?instance.zeroIsUnlimited,
    };
