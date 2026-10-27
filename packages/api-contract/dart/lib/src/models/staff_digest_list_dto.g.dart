// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_digest_list_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffDigestListDto _$StaffDigestListDtoFromJson(Map<String, dynamic> json) =>
    StaffDigestListDto(
      items: (json['items'] as List<dynamic>)
          .map((e) => StaffDigestDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$StaffDigestListDtoToJson(StaffDigestListDto instance) =>
    <String, dynamic>{'items': instance.items.map((e) => e.toJson()).toList()};
