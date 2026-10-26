// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'accept_legal_documents_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AcceptLegalDocumentsDto _$AcceptLegalDocumentsDtoFromJson(
  Map<String, dynamic> json,
) => AcceptLegalDocumentsDto(
  documentIds: (json['documentIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  deviceId: json['deviceId'] as String?,
);

Map<String, dynamic> _$AcceptLegalDocumentsDtoToJson(
  AcceptLegalDocumentsDto instance,
) => <String, dynamic>{
  'documentIds': instance.documentIds,
  'deviceId': ?instance.deviceId,
};
