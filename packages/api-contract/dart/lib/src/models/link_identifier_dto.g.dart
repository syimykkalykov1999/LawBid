// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'link_identifier_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LinkIdentifierDto _$LinkIdentifierDtoFromJson(Map<String, dynamic> json) =>
    LinkIdentifierDto(
      provider: LinkIdentifierDtoProvider.fromJson(json['provider'] as String),
      identifier: json['identifier'] as String?,
      code: json['code'] as String?,
      idToken: json['idToken'] as String?,
      nonce: json['nonce'] as String?,
    );

Map<String, dynamic> _$LinkIdentifierDtoToJson(LinkIdentifierDto instance) =>
    <String, dynamic>{
      'provider': instance.provider.toJson(),
      'identifier': ?instance.identifier,
      'code': ?instance.code,
      'idToken': ?instance.idToken,
      'nonce': ?instance.nonce,
    };
