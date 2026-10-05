// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_payment_requests_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreatePaymentRequestsDto _$CreatePaymentRequestsDtoFromJson(
  Map<String, dynamic> json,
) => CreatePaymentRequestsDto(
  description: json['description'] as String,
  items: (json['items'] as List<dynamic>)
      .map((e) => PaymentRequestItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  processingFeePayer: json['processingFeePayer'] == null
      ? null
      : ProcessingFeePayer.fromJson(json['processingFeePayer'] as String),
);

Map<String, dynamic> _$CreatePaymentRequestsDtoToJson(
  CreatePaymentRequestsDto instance,
) => <String, dynamic>{
  'description': instance.description,
  'processingFeePayer': ?instance.processingFeePayer?.toJson(),
  'items': instance.items.map((e) => e.toJson()).toList(),
};
