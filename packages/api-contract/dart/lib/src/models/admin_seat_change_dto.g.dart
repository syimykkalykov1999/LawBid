// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_seat_change_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSeatChangeDto _$AdminSeatChangeDtoFromJson(Map<String, dynamic> json) =>
    AdminSeatChangeDto(
      id: json['id'] as String,
      userId: json['userId'] as String,
      user: json['user'] == null
          ? null
          : AdminBillingUserDto.fromJson(json['user'] as Map<String, dynamic>),
      fromSeats: (json['fromSeats'] as num).toInt(),
      toSeats: (json['toSeats'] as num).toInt(),
      amountCents: (json['amountCents'] as num).toInt(),
      currency: json['currency'] as String,
      status: AssistantSeatChangeStatus.fromJson(json['status'] as String),
      stripeInvoiceId: json['stripeInvoiceId'] as String?,
      invoiceUrl: json['invoiceUrl'] as String?,
      effectiveAt: json['effectiveAt'] == null
          ? null
          : DateTime.parse(json['effectiveAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$AdminSeatChangeDtoToJson(AdminSeatChangeDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'userId': instance.userId,
      'user': ?instance.user?.toJson(),
      'fromSeats': instance.fromSeats,
      'toSeats': instance.toSeats,
      'amountCents': instance.amountCents,
      'currency': instance.currency,
      'status': instance.status.toJson(),
      'stripeInvoiceId': ?instance.stripeInvoiceId,
      'invoiceUrl': ?instance.invoiceUrl,
      'effectiveAt': ?instance.effectiveAt?.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
