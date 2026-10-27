// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_next_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewNextDto _$ReviewNextDtoFromJson(Map<String, dynamic> json) =>
    ReviewNextDto(
      status: StaffReviewNextStatus.fromJson(json['status'] as String),
      sample: json['sample'] == null
          ? null
          : ReviewSampleDto.fromJson(json['sample'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ReviewNextDtoToJson(ReviewNextDto instance) =>
    <String, dynamic>{
      'status': instance.status.toJson(),
      'sample': ?instance.sample?.toJson(),
    };
