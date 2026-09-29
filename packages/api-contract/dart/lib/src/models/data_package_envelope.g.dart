// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'data_package_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DataPackageEnvelope _$DataPackageEnvelopeFromJson(Map<String, dynamic> json) =>
    DataPackageEnvelope(
      data: DataPackageDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$DataPackageEnvelopeToJson(
  DataPackageEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
