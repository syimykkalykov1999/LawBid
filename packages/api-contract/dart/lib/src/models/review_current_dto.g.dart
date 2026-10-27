// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_current_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewCurrentDto _$ReviewCurrentDtoFromJson(Map<String, dynamic> json) =>
    ReviewCurrentDto(
      sample: json['sample'] == null
          ? null
          : ReviewSampleDto.fromJson(json['sample'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ReviewCurrentDtoToJson(ReviewCurrentDto instance) =>
    <String, dynamic>{'sample': ?instance.sample?.toJson()};
