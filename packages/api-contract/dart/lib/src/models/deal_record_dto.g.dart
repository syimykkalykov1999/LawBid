// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deal_record_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DealRecordDto _$DealRecordDtoFromJson(Map<String, dynamic> json) =>
    DealRecordDto(
      id: json['id'] as String,
      caseId: json['caseId'] as String,
      bidId: json['bidId'] as String,
      status: DealRecordStatus.fromJson(json['status'] as String),
      acceptedBy: PartyRole.fromJson(json['acceptedBy'] as String),
      myRole: PartyRole.fromJson(json['myRole'] as String),
      myTurnToSign: json['myTurnToSign'] as bool,
      recordCode: json['recordCode'] as String,
      snapshotSha256: json['snapshotSha256'] as String,
      sealedSha256: json['sealedSha256'] as String?,
      textVersion: (json['textVersion'] as num).toInt(),
      acceptedAt: DateTime.parse(json['acceptedAt'] as String),
      caseValue: DealCaseDto.fromJson(json['case'] as Map<String, dynamic>),
      client: DealPartyDto.fromJson(json['client'] as Map<String, dynamic>),
      attorney: DealAttorneyDto.fromJson(
        json['attorney'] as Map<String, dynamic>,
      ),
      terms: DealTermsDto.fromJson(json['terms'] as Map<String, dynamic>),
      history: (json['history'] as List<dynamic>)
          .map((e) => DealOfferDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      notContractText: json['notContractText'] as String,
      footerText: json['footerText'] as String,
      signatures: (json['signatures'] as List<dynamic>)
          .map((e) => DealSignatureDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      unsignedUrl: json['unsignedUrl'] as String?,
      sealedUrl: json['sealedUrl'] as String?,
      sealedFileId: json['sealedFileId'] as String?,
      unsignedFileId: json['unsignedFileId'] as String?,
      agreementFileId: json['agreementFileId'] as String?,
      agreementUrl: json['agreementUrl'] as String?,
      declineReason: json['declineReason'] as String?,
      failedReason: json['failedReason'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      sealedAt: json['sealedAt'] == null
          ? null
          : DateTime.parse(json['sealedAt'] as String),
      declinedAt: json['declinedAt'] == null
          ? null
          : DateTime.parse(json['declinedAt'] as String),
    );

Map<String, dynamic> _$DealRecordDtoToJson(DealRecordDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'caseId': instance.caseId,
      'bidId': instance.bidId,
      'status': instance.status.toJson(),
      'acceptedBy': instance.acceptedBy.toJson(),
      'myRole': instance.myRole.toJson(),
      'myTurnToSign': instance.myTurnToSign,
      'recordCode': instance.recordCode,
      'snapshotSha256': instance.snapshotSha256,
      'sealedSha256': ?instance.sealedSha256,
      'textVersion': instance.textVersion,
      'acceptedAt': instance.acceptedAt.toIso8601String(),
      'case': instance.caseValue.toJson(),
      'client': instance.client.toJson(),
      'attorney': instance.attorney.toJson(),
      'terms': instance.terms.toJson(),
      'history': instance.history.map((e) => e.toJson()).toList(),
      'notContractText': instance.notContractText,
      'footerText': instance.footerText,
      'signatures': instance.signatures.map((e) => e.toJson()).toList(),
      'unsignedUrl': ?instance.unsignedUrl,
      'sealedUrl': ?instance.sealedUrl,
      'sealedFileId': ?instance.sealedFileId,
      'unsignedFileId': ?instance.unsignedFileId,
      'agreementFileId': ?instance.agreementFileId,
      'agreementUrl': ?instance.agreementUrl,
      'declineReason': ?instance.declineReason,
      'failedReason': ?instance.failedReason,
      'createdAt': instance.createdAt.toIso8601String(),
      'sealedAt': ?instance.sealedAt?.toIso8601String(),
      'declinedAt': ?instance.declinedAt?.toIso8601String(),
    };
