// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'erasure_record_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ErasureRecordDto _$ErasureRecordDtoFromJson(Map<String, dynamic> json) =>
    ErasureRecordDto(
      status: ErasureRecordDtoStatus.fromJson(json['status'] as String),
      stores: json['stores'],
      certificate: json['certificate'],
    );

Map<String, dynamic> _$ErasureRecordDtoToJson(ErasureRecordDto instance) =>
    <String, dynamic>{
      'status': instance.status.toJson(),
      'stores': ?instance.stores,
      'certificate': ?instance.certificate,
    };
