// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payment_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PaymentRequestDto _$PaymentRequestDtoFromJson(
  Map<String, dynamic> json,
) => PaymentRequestDto(
  id: json['id'] as String,
  caseId: json['caseId'] as String,
  caseTitle: json['caseTitle'] as String?,
  amountCents: (json['amountCents'] as num).toInt(),
  description: json['description'] as String,
  dueAt: json['dueAt'] == null ? null : DateTime.parse(json['dueAt'] as String),
  processingFeePayer: ProcessingFeePayer.fromJson(
    json['processingFeePayer'] as String,
  ),
  processingFeeCents: (json['processingFeeCents'] as num).toInt(),
  clientTotalCents: (json['clientTotalCents'] as num).toInt(),
  attorneyReceivesCents: (json['attorneyReceivesCents'] as num).toInt(),
  feePayerStatus: FeePayerStatus.fromJson(json['feePayerStatus'] as String),
  feePayerBy: FeePayerParty.fromJson(json['feePayerBy'] as String),
  feePayerRounds: (json['feePayerRounds'] as num).toInt(),
  feePayerMaxRounds: (json['feePayerMaxRounds'] as num).toInt(),
  canPay: json['canPay'] as bool,
  status: PaymentRequestStatus.fromJson(json['status'] as String),
  overdue: json['overdue'] as bool,
  planId: json['planId'] as String?,
  seq: (json['seq'] as num).toInt(),
  total: (json['total'] as num).toInt(),
  paymentId: json['paymentId'] as String?,
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
);

Map<String, dynamic> _$PaymentRequestDtoToJson(PaymentRequestDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'caseId': instance.caseId,
      'caseTitle': ?instance.caseTitle,
      'amountCents': instance.amountCents,
      'description': instance.description,
      'dueAt': ?instance.dueAt?.toIso8601String(),
      'processingFeePayer': instance.processingFeePayer.toJson(),
      'processingFeeCents': instance.processingFeeCents,
      'clientTotalCents': instance.clientTotalCents,
      'attorneyReceivesCents': instance.attorneyReceivesCents,
      'feePayerStatus': instance.feePayerStatus.toJson(),
      'feePayerBy': instance.feePayerBy.toJson(),
      'feePayerRounds': instance.feePayerRounds,
      'feePayerMaxRounds': instance.feePayerMaxRounds,
      'canPay': instance.canPay,
      'status': instance.status.toJson(),
      'overdue': instance.overdue,
      'planId': ?instance.planId,
      'seq': instance.seq,
      'total': instance.total,
      'paymentId': ?instance.paymentId,
      'paidAt': ?instance.paidAt?.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
      'client': ?instance.client?.toJson(),
      'attorney': ?instance.attorney?.toJson(),
    };
