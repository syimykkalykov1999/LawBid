// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_case_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateCaseDto _$UpdateCaseDtoFromJson(Map<String, dynamic> json) =>
    UpdateCaseDto(
      title: json['title'] as String?,
      description: json['description'] as String?,
      practiceAreaId: json['practiceAreaId'] as String?,
      primaryStateCode: json['primaryStateCode'] as String?,
      additionalStateCodes: (json['additionalStateCodes'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      city: json['city'] as String?,
      budgetMode: json['budgetMode'] == null
          ? null
          : BudgetMode.fromJson(json['budgetMode'] as String),
      budgetAmountDollars: (json['budgetAmountDollars'] as num?)?.toInt(),
    );

Map<String, dynamic> _$UpdateCaseDtoToJson(UpdateCaseDto instance) =>
    <String, dynamic>{
      'title': ?instance.title,
      'description': ?instance.description,
      'practiceAreaId': ?instance.practiceAreaId,
      'primaryStateCode': ?instance.primaryStateCode,
      'additionalStateCodes': ?instance.additionalStateCodes,
      'city': ?instance.city,
      'budgetMode': ?instance.budgetMode?.toJson(),
      'budgetAmountDollars': ?instance.budgetAmountDollars,
    };
