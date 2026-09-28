// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'verification_overview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VerificationOverviewDto _$VerificationOverviewDtoFromJson(
  Map<String, dynamic> json,
) => VerificationOverviewDto(
  verificationStatus: VerificationStatus.fromJson(
    json['verificationStatus'] as String,
  ),
  identityRequired: json['identityRequired'] as bool,
  submissionsLast30Days: (json['submissionsLast30Days'] as num).toInt(),
  maxSubmissions30Days: (json['maxSubmissions30Days'] as num).toInt(),
  request: json['request'] == null
      ? null
      : VerificationRequestDto.fromJson(
          json['request'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$VerificationOverviewDtoToJson(
  VerificationOverviewDto instance,
) => <String, dynamic>{
  'verificationStatus': instance.verificationStatus.toJson(),
  'request': ?instance.request?.toJson(),
  'identityRequired': instance.identityRequired,
  'submissionsLast30Days': instance.submissionsLast30Days,
  'maxSubmissions30Days': instance.maxSubmissions30Days,
};
