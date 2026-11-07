// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_dispute_refund_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDisputeRefundDto _$AdminDisputeRefundDtoFromJson(
  Map<String, dynamic> json,
) => AdminDisputeRefundDto(
  id: json['id'] as String,
  disputeId: json['disputeId'] as String,
  userId: json['userId'] as String,
  user: json['user'] == null
      ? null
      : AdminBillingUserDto.fromJson(json['user'] as Map<String, dynamic>),
  paymentId: json['paymentId'] as String,
  status: DisputeRefundStatus.fromJson(json['status'] as String),
  reason: json['reason'] as String?,
  amountCents: (json['amountCents'] as num).toInt(),
  currency: json['currency'] as String,
  refundId: json['refundId'] as String?,
  note: json['note'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$AdminDisputeRefundDtoToJson(
  AdminDisputeRefundDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'disputeId': instance.disputeId,
  'userId': instance.userId,
  'user': ?instance.user?.toJson(),
  'paymentId': instance.paymentId,
  'status': instance.status.toJson(),
  'reason': ?instance.reason,
  'amountCents': instance.amountCents,
  'currency': instance.currency,
  'refundId': ?instance.refundId,
  'note': ?instance.note,
  'createdAt': instance.createdAt.toIso8601String(),
};
