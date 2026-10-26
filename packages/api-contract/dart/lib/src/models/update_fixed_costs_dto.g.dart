// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_fixed_costs_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateFixedCostsDto _$UpdateFixedCostsDtoFromJson(Map<String, dynamic> json) =>
    UpdateFixedCostsDto(
      items: (json['items'] as List<dynamic>)
          .map((e) => FixedCostDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$UpdateFixedCostsDtoToJson(
  UpdateFixedCostsDto instance,
) => <String, dynamic>{'items': instance.items.map((e) => e.toJson()).toList()};
