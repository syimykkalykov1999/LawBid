// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_payment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CasePaymentDto _$CasePaymentDtoFromJson(
  Map<String, dynamic> json,
) => CasePaymentDto(
  id: json['id'] as String,
  caseId: json['caseId'] as String,
  caseTitle: json['caseTitle'] as String?,
  kind: CasePaymentKind.fromJson(json['kind'] as String),
  requestId: json['requestId'] as String?,
  status: CasePaymentStatus.fromJson(json['status'] as String),
  amountCents: (json['amountCents'] as num).toInt(),
  platformFeeCents: (json['platformFeeCents'] as num).toInt(),
  processingFeeCents: (json['processingFeeCents'] as num).toInt(),
  clientTotalCents: (json['clientTotalCents'] as num).toInt(),
  attorneyNetCents: (json['attorneyNetCents'] as num).toInt(),
  processingFeePayer: ProcessingFeePayer.fromJson(
    json['processingFeePayer'] as String,
  ),
  refundedCents: (json['refundedCents'] as num).toInt(),
  currency: json['currency'] as String,
  note: json['note'] as String?,
  receiptUrl: json['receiptUrl'] as String?,
  disputeStatus: json['disputeStatus'] as String?,
  paidAt: json['paidAt'] == null
      ? null
      : DateTime.parse(json['paidAt'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
  client: json['client'] == null
      ? null
      : CasePaymentPartyDto.fromJson(json['client'] as Map<String, dynamic>),
  attorney: json['attorney'] == null
      ? null
      : CasePaymentPartyDto.fromJson(json['attorney'] as Map<String, dynamic>),
  refundable: json['refundable'] as bool,
);

Map<String, dynamic> _$CasePaymentDtoToJson(CasePaymentDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'caseId': instance.caseId,
      'caseTitle': ?instance.caseTitle,
      'kind': instance.kind.toJson(),
      'requestId': ?instance.requestId,
      'status': instance.status.toJson(),
      'amountCents': instance.amountCents,
      'platformFeeCents': instance.platformFeeCents,
      'processingFeeCents': instance.processingFeeCents,
      'clientTotalCents': instance.clientTotalCents,
      'attorneyNetCents': instance.attorneyNetCents,
      'processingFeePayer': instance.processingFeePayer.toJson(),
      'refundedCents': instance.refundedCents,
      'currency': instance.currency,
      'note': ?instance.note,
      'receiptUrl': ?instance.receiptUrl,
      'disputeStatus': ?instance.disputeStatus,
      'paidAt': ?instance.paidAt?.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
      'client': ?instance.client?.toJson(),
      'attorney': ?instance.attorney?.toJson(),
      'refundable': instance.refundable,
    };
