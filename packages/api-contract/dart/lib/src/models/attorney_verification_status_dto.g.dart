// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'attorney_verification_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AttorneyVerificationStatusDto _$AttorneyVerificationStatusDtoFromJson(
  Map<String, dynamic> json,
) => AttorneyVerificationStatusDto(
  attorneyId: json['attorneyId'] as String,
  verificationStatus: VerificationStatus.fromJson(
    json['verificationStatus'] as String,
  ),
  withdrawnBids: (json['withdrawnBids'] as num).toInt(),
);

Map<String, dynamic> _$AttorneyVerificationStatusDtoToJson(
  AttorneyVerificationStatusDto instance,
) => <String, dynamic>{
  'attorneyId': instance.attorneyId,
  'verificationStatus': instance.verificationStatus.toJson(),
  'withdrawnBids': instance.withdrawnBids,
};
