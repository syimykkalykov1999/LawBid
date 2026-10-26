// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'minors_list_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MinorsListDto _$MinorsListDtoFromJson(Map<String, dynamic> json) =>
    MinorsListDto(
      items: (json['items'] as List<dynamic>)
          .map((e) => MinorRowDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$MinorsListDtoToJson(MinorsListDto instance) =>
    <String, dynamic>{'items': instance.items.map((e) => e.toJson()).toList()};
