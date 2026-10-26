// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'publish_legal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PublishLegalDto _$PublishLegalDtoFromJson(Map<String, dynamic> json) =>
    PublishLegalDto(
      changeNote: json['changeNote'] as String?,
      requiresReacceptance: json['requiresReacceptance'] as bool? ?? true,
    );

Map<String, dynamic> _$PublishLegalDtoToJson(PublishLegalDto instance) =>
    <String, dynamic>{
      'requiresReacceptance': instance.requiresReacceptance,
      'changeNote': ?instance.changeNote,
    };
