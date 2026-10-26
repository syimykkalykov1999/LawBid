// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_gift_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminGiftEnvelope _$AdminGiftEnvelopeFromJson(Map<String, dynamic> json) =>
    AdminGiftEnvelope(
      data: AdminGiftDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AdminGiftEnvelopeToJson(AdminGiftEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
