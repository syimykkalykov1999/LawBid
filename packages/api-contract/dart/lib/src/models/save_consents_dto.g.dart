// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'save_consents_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SaveConsentsDto _$SaveConsentsDtoFromJson(Map<String, dynamic> json) =>
    SaveConsentsDto(
      consents: (json['consents'] as List<dynamic>)
          .map((e) => ConsentItemDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$SaveConsentsDtoToJson(SaveConsentsDto instance) =>
    <String, dynamic>{
      'consents': instance.consents.map((e) => e.toJson()).toList(),
    };
