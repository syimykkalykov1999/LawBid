// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'passkey_list_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PasskeyListDto _$PasskeyListDtoFromJson(Map<String, dynamic> json) =>
    PasskeyListDto(
      passkeys: (json['passkeys'] as List<dynamic>)
          .map((e) => PasskeyDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$PasskeyListDtoToJson(PasskeyListDto instance) =>
    <String, dynamic>{
      'passkeys': instance.passkeys.map((e) => e.toJson()).toList(),
    };
