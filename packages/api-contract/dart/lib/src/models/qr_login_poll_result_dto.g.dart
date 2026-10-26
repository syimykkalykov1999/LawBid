// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'qr_login_poll_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QrLoginPollResultDto _$QrLoginPollResultDtoFromJson(
  Map<String, dynamic> json,
) => QrLoginPollResultDto(
  status: QrLoginPollResultDtoStatus.fromJson(json['status'] as String),
  accessToken: json['accessToken'] as String?,
  refreshToken: json['refreshToken'] as String?,
  accessTokenExpiresIn: (json['accessTokenExpiresIn'] as num?)?.toInt(),
);

Map<String, dynamic> _$QrLoginPollResultDtoToJson(
  QrLoginPollResultDto instance,
) => <String, dynamic>{
  'status': instance.status.toJson(),
  'accessToken': ?instance.accessToken,
  'refreshToken': ?instance.refreshToken,
  'accessTokenExpiresIn': ?instance.accessTokenExpiresIn,
};
