// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_data_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateDataRequestDto _$CreateDataRequestDtoFromJson(
  Map<String, dynamic> json,
) => CreateDataRequestDto(
  requestType: CreateDataRequestDtoRequestType.fromJson(
    json['requestType'] as String,
  ),
  referenceNumber: json['referenceNumber'] as String,
  agency: json['agency'] as String,
  receivedAt: DateTime.parse(json['receivedAt'] as String),
  scope: json['scope'] as String,
  notes: json['notes'] as String?,
);

Map<String, dynamic> _$CreateDataRequestDtoToJson(
  CreateDataRequestDto instance,
) => <String, dynamic>{
  'requestType': instance.requestType.toJson(),
  'referenceNumber': instance.referenceNumber,
  'agency': instance.agency,
  'receivedAt': instance.receivedAt.toIso8601String(),
  'scope': instance.scope,
  'notes': ?instance.notes,
};
