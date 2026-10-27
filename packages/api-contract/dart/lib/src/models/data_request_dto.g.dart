// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'data_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DataRequestDto _$DataRequestDtoFromJson(Map<String, dynamic> json) =>
    DataRequestDto(
      id: json['id'] as String,
      requestType: DataRequestDtoRequestType.fromJson(
        json['requestType'] as String,
      ),
      referenceNumber: json['referenceNumber'] as String,
      agency: json['agency'] as String,
      receivedAt: DateTime.parse(json['receivedAt'] as String),
      scope: json['scope'] as String,
      status: DataRequestDtoStatus.fromJson(json['status'] as String),
      handledBy: json['handledBy'] as String,
      notes: json['notes'] as String?,
      closedAt: json['closedAt'] == null
          ? null
          : DateTime.parse(json['closedAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      accessCount: (json['accessCount'] as num).toInt(),
      legalBasis: json['legalBasis'] as String?,
      country: json['country'] as String?,
      subjectUserId: json['subjectUserId'] as String?,
      dueAt: json['dueAt'] == null
          ? null
          : DateTime.parse(json['dueAt'] as String),
      doNotNotify: json['doNotNotify'] as bool,
      nondisclosureUntil: json['nondisclosureUntil'] == null
          ? null
          : DateTime.parse(json['nondisclosureUntil'] as String),
      userNotifiedAt: json['userNotifiedAt'] == null
          ? null
          : DateTime.parse(json['userNotifiedAt'] as String),
    );

Map<String, dynamic> _$DataRequestDtoToJson(DataRequestDto instance) =>
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
      'legalBasis': ?instance.legalBasis,
      'country': ?instance.country,
      'subjectUserId': ?instance.subjectUserId,
      'dueAt': ?instance.dueAt?.toIso8601String(),
      'doNotNotify': instance.doNotNotify,
      'nondisclosureUntil': ?instance.nondisclosureUntil?.toIso8601String(),
      'userNotifiedAt': ?instance.userNotifiedAt?.toIso8601String(),
    };
