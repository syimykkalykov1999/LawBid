// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'consent_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConsentItemDto _$ConsentItemDtoFromJson(Map<String, dynamic> json) =>
    ConsentItemDto(
      type: ConsentItemDtoType.fromJson(json['type'] as String),
      granted: json['granted'] as bool,
      documentId: json['documentId'] as String?,
    );

Map<String, dynamic> _$ConsentItemDtoToJson(ConsentItemDto instance) =>
    <String, dynamic>{
      'type': instance.type.toJson(),
      'granted': instance.granted,
      'documentId': ?instance.documentId,
    };
