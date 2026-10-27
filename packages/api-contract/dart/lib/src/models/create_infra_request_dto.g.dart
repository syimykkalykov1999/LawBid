// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_infra_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateInfraRequestDto _$CreateInfraRequestDtoFromJson(
  Map<String, dynamic> json,
) => CreateInfraRequestDto(
  itemId: json['itemId'] as String,
  to: CreateInfraRequestDtoTo.fromJson(json['to'] as String),
);

Map<String, dynamic> _$CreateInfraRequestDtoToJson(
  CreateInfraRequestDto instance,
) => <String, dynamic>{'itemId': instance.itemId, 'to': instance.to.toJson()};
