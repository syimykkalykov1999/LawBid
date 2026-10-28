// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'counter_offer_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CounterOfferDto _$CounterOfferDtoFromJson(Map<String, dynamic> json) =>
    CounterOfferDto(
      paymentTerms: json['paymentTerms'] == null
          ? null
          : PaymentTermsDto.fromJson(
              json['paymentTerms'] as Map<String, dynamic>,
            ),
      amountCents: (json['amountCents'] as num?)?.toInt(),
      percentBps: (json['percentBps'] as num?)?.toInt(),
      message: json['message'] as String?,
    );

Map<String, dynamic> _$CounterOfferDtoToJson(CounterOfferDto instance) =>
    <String, dynamic>{
      'paymentTerms': ?instance.paymentTerms?.toJson(),
      'amountCents': ?instance.amountCents,
      'percentBps': ?instance.percentBps,
      'message': ?instance.message,
    };
