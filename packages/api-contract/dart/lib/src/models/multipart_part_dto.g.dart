// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'multipart_part_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MultipartPartDto _$MultipartPartDtoFromJson(Map<String, dynamic> json) =>
    MultipartPartDto(
      partNumber: json['partNumber'] as num,
      url: json['url'] as String,
    );

Map<String, dynamic> _$MultipartPartDtoToJson(MultipartPartDto instance) =>
    <String, dynamic>{'partNumber': instance.partNumber, 'url': instance.url};
