// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_attorney_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminAttorneySummaryDto _$AdminAttorneySummaryDtoFromJson(
  Map<String, dynamic> json,
) => AdminAttorneySummaryDto(
  id: json['id'] as String,
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
  username: json['username'] as String,
  verificationStatus: VerificationStatus.fromJson(
    json['verificationStatus'] as String,
  ),
);

Map<String, dynamic> _$AdminAttorneySummaryDtoToJson(
  AdminAttorneySummaryDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'username': instance.username,
  'verificationStatus': instance.verificationStatus.toJson(),
};
