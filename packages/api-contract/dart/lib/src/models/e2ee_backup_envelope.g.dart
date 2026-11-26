// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'e2ee_backup_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

E2eeBackupEnvelope _$E2eeBackupEnvelopeFromJson(Map<String, dynamic> json) =>
    E2eeBackupEnvelope(
      data: E2eeBackupDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$E2eeBackupEnvelopeToJson(E2eeBackupEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
