// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pricing_matrix_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PricingMatrixDto _$PricingMatrixDtoFromJson(
  Map<String, dynamic> json,
) => PricingMatrixDto(
  post: TargetPricingDto.fromJson(json['post'] as Map<String, dynamic>),
  video: TargetPricingDto.fromJson(json['video'] as Map<String, dynamic>),
  caseValue: TargetPricingDto.fromJson(json['case'] as Map<String, dynamic>),
  profile: TargetPricingDto.fromJson(json['profile'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PricingMatrixDtoToJson(PricingMatrixDto instance) =>
    <String, dynamic>{
      'post': instance.post.toJson(),
      'video': instance.video.toJson(),
      'case': instance.caseValue.toJson(),
      'profile': instance.profile.toJson(),
    };
