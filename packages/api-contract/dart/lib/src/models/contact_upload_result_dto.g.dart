// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contact_upload_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContactUploadResultDto _$ContactUploadResultDtoFromJson(
  Map<String, dynamic> json,
) => ContactUploadResultDto(
  matched: (json['matched'] as num).toInt(),
  people: (json['people'] as List<dynamic>)
      .map((e) => ContactPersonDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$ContactUploadResultDtoToJson(
  ContactUploadResultDto instance,
) => <String, dynamic>{
  'matched': instance.matched,
  'people': instance.people.map((e) => e.toJson()).toList(),
};
