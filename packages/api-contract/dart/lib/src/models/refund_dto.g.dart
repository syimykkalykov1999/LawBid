// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'refund_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RefundDto _$RefundDtoFromJson(Map<String, dynamic> json) => RefundDto(
  id: json['id'] as String,
  paymentId: json['paymentId'] as String,
  userId: json['userId'] as String,
  user: json['user'] == null
      ? null
      : AdminBillingUserDto.fromJson(json['user'] as Map<String, dynamic>),
  amountCents: (json['amountCents'] as num).toInt(),
  reason: json['reason'] as String,
  status: RefundDtoStatus.fromJson(json['status'] as String),
  stripeRefundId: json['stripeRefundId'] as String?,
  failureReason: json['failureReason'] as String?,
  adminId: json['adminId'] as String,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$RefundDtoToJson(RefundDto instance) => <String, dynamic>{
  'id': instance.id,
  'paymentId': instance.paymentId,
  'userId': instance.userId,
  'user': ?instance.user?.toJson(),
  'amountCents': instance.amountCents,
  'reason': instance.reason,
  'status': instance.status.toJson(),
  'stripeRefundId': ?instance.stripeRefundId,
  'failureReason': ?instance.failureReason,
  'adminId': instance.adminId,
  'createdAt': instance.createdAt.toIso8601String(),
};
