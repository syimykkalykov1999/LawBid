// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_golden_list_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewGoldenListDto _$ReviewGoldenListDtoFromJson(Map<String, dynamic> json) =>
    ReviewGoldenListDto(
      items: (json['items'] as List<dynamic>)
          .map((e) => ReviewGoldenRowDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$ReviewGoldenListDtoToJson(
  ReviewGoldenListDto instance,
) => <String, dynamic>{'items': instance.items.map((e) => e.toJson()).toList()};
