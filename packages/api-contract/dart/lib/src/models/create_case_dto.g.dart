// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_case_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateCaseDto _$CreateCaseDtoFromJson(Map<String, dynamic> json) =>
    CreateCaseDto(
      practiceAreaId: json['practiceAreaId'] as String,
      title: json['title'] as String,
      description: json['description'] as String,
      primaryStateCode: json['primaryStateCode'] as String,
      budgetMode: BudgetMode.fromJson(json['budgetMode'] as String),
      additionalStateCodes: (json['additionalStateCodes'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      city: json['city'] as String?,
      budgetAmountDollars: (json['budgetAmountDollars'] as num?)?.toInt(),
      clientContactSharingConsent: json['clientContactSharingConsent'] as bool?,
    );

Map<String, dynamic> _$CreateCaseDtoToJson(CreateCaseDto instance) =>
    <String, dynamic>{
      'practiceAreaId': instance.practiceAreaId,
      'title': instance.title,
      'description': instance.description,
      'primaryStateCode': instance.primaryStateCode,
      'additionalStateCodes': ?instance.additionalStateCodes,
      'city': ?instance.city,
      'budgetMode': instance.budgetMode.toJson(),
      'budgetAmountDollars': ?instance.budgetAmountDollars,
      'clientContactSharingConsent': ?instance.clientContactSharingConsent,
    };
