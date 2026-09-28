// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'own_verification_document_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OwnVerificationDocumentDto _$OwnVerificationDocumentDtoFromJson(
  Map<String, dynamic> json,
) => OwnVerificationDocumentDto(
  id: json['id'] as String,
  docType: VerificationDocType.fromJson(json['docType'] as String),
  side: json['side'] == null
      ? null
      : OwnVerificationDocumentDtoSide.fromJson(json['side'] as String),
  stateCode: json['stateCode'] as String?,
  fileId: json['fileId'] as String,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$OwnVerificationDocumentDtoToJson(
  OwnVerificationDocumentDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'docType': instance.docType.toJson(),
  'side': ?instance.side?.toJson(),
  'stateCode': ?instance.stateCode,
  'fileId': instance.fileId,
  'createdAt': instance.createdAt.toIso8601String(),
};
