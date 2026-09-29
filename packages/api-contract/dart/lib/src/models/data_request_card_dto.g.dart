// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'data_request_card_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DataRequestCardDto _$DataRequestCardDtoFromJson(Map<String, dynamic> json) =>
    DataRequestCardDto(
      id: json['id'] as String,
      requestType: DataRequestCardDtoRequestType.fromJson(
        json['requestType'] as String,
      ),
      referenceNumber: json['referenceNumber'] as String,
      agency: json['agency'] as String,
      receivedAt: DateTime.parse(json['receivedAt'] as String),
      scope: json['scope'] as String,
      status: DataRequestCardDtoStatus.fromJson(json['status'] as String),
      handledBy: json['handledBy'] as String,
      notes: json['notes'] as String?,
      closedAt: json['closedAt'] == null
          ? null
          : DateTime.parse(json['closedAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      accessCount: (json['accessCount'] as num).toInt(),
      accessLog: (json['accessLog'] as List<dynamic>)
          .map((e) => DataAccessLogEntryDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$DataRequestCardDtoToJson(DataRequestCardDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'requestType': instance.requestType.toJson(),
      'referenceNumber': instance.referenceNumber,
      'agency': instance.agency,
      'receivedAt': instance.receivedAt.toIso8601String(),
      'scope': instance.scope,
      'status': instance.status.toJson(),
      'handledBy': instance.handledBy,
      'notes': ?instance.notes,
      'closedAt': ?instance.closedAt?.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
      'accessCount': instance.accessCount,
      'accessLog': instance.accessLog.map((e) => e.toJson()).toList(),
    };
