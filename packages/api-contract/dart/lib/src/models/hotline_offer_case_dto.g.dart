// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_offer_case_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineOfferCaseDto _$HotlineOfferCaseDtoFromJson(Map<String, dynamic> json) =>
    HotlineOfferCaseDto(
      budgetAmountDollars: json['budgetAmountDollars'] as num?,
      message: json['message'] as String?,
      clientContactSharingConsent: json['clientContactSharingConsent'] as bool?,
    );

Map<String, dynamic> _$HotlineOfferCaseDtoToJson(
  HotlineOfferCaseDto instance,
) => <String, dynamic>{
  'budgetAmountDollars': ?instance.budgetAmountDollars,
  'message': ?instance.message,
  'clientContactSharingConsent': ?instance.clientContactSharingConsent,
};
