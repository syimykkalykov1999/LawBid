// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_client_card_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminClientCardDto _$AdminClientCardDtoFromJson(Map<String, dynamic> json) =>
    AdminClientCardDto(
      stateCode: json['stateCode'] as String,
      preferredContactMethod: json['preferredContactMethod'] as String?,
      preferredLanguages: (json['preferredLanguages'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$AdminClientCardDtoToJson(AdminClientCardDto instance) =>
    <String, dynamic>{
      'stateCode': instance.stateCode,
      'preferredContactMethod': ?instance.preferredContactMethod,
      'preferredLanguages': instance.preferredLanguages,
    };
