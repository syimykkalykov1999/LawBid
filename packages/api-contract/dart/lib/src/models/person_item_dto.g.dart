// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'person_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PersonItemDto _$PersonItemDtoFromJson(Map<String, dynamic> json) =>
    PersonItemDto(
      role: PersonRole.fromJson(json['role'] as String),
      attorney: json['attorney'] == null
          ? null
          : AttorneyListItemDto.fromJson(
              json['attorney'] as Map<String, dynamic>,
            ),
      client: json['client'] == null
          ? null
          : ClientListItemDto.fromJson(json['client'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$PersonItemDtoToJson(PersonItemDto instance) =>
    <String, dynamic>{
      'role': instance.role.toJson(),
      'attorney': ?instance.attorney?.toJson(),
      'client': ?instance.client?.toJson(),
    };
