// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'new_entitlement_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NewEntitlementDto _$NewEntitlementDtoFromJson(Map<String, dynamic> json) =>
    NewEntitlementDto(
      key: json['key'] as String,
      type: NewEntitlementDtoType.fromJson(json['type'] as String),
      audiences: (json['audiences'] as List<dynamic>)
          .map((e) => NewEntitlementDtoAudiences.fromJson(e as String))
          .toList(),
      group: NewEntitlementDtoGroup.fromJson(json['group'] as String),
      label: NewTextDto.fromJson(json['label'] as Map<String, dynamic>),
      description: NewTextDto.fromJson(
        json['description'] as Map<String, dynamic>,
      ),
      max: (json['max'] as num?)?.toInt(),
      zeroIsUnlimited: json['zeroIsUnlimited'] as bool?,
    );

Map<String, dynamic> _$NewEntitlementDtoToJson(NewEntitlementDto instance) =>
    <String, dynamic>{
      'key': instance.key,
      'type': instance.type.toJson(),
      'audiences': instance.audiences.map((e) => e.toJson()).toList(),
      'group': instance.group.toJson(),
      'label': instance.label.toJson(),
      'description': instance.description.toJson(),
      'max': ?instance.max,
      'zeroIsUnlimited': ?instance.zeroIsUnlimited,
    };
