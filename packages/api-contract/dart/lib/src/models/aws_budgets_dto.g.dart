// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'aws_budgets_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AwsBudgetsDto _$AwsBudgetsDtoFromJson(Map<String, dynamic> json) =>
    AwsBudgetsDto(
      available: json['available'] as bool,
      items: (json['items'] as List<dynamic>)
          .map((e) => AwsBudgetDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$AwsBudgetsDtoToJson(AwsBudgetsDto instance) =>
    <String, dynamic>{
      'available': instance.available,
      'items': instance.items.map((e) => e.toJson()).toList(),
    };
