// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payment_request_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PaymentRequestItemDto _$PaymentRequestItemDtoFromJson(
  Map<String, dynamic> json,
) => PaymentRequestItemDto(
  amountCents: (json['amountCents'] as num).toInt(),
  description: json['description'] as String?,
  dueAt: json['dueAt'] == null ? null : DateTime.parse(json['dueAt'] as String),
);

Map<String, dynamic> _$PaymentRequestItemDtoToJson(
  PaymentRequestItemDto instance,
) => <String, dynamic>{
  'amountCents': instance.amountCents,
  'description': ?instance.description,
  'dueAt': ?instance.dueAt?.toIso8601String(),
};
