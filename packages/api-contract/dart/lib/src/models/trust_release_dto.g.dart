// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_release_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustReleaseDto _$TrustReleaseDtoFromJson(Map<String, dynamic> json) =>
    TrustReleaseDto(
      note: json['note'] as String?,
      payments: json['payments'] as bool?,
      bids: json['bids'] as bool?,
    );

Map<String, dynamic> _$TrustReleaseDtoToJson(TrustReleaseDto instance) =>
    <String, dynamic>{
      'note': ?instance.note,
      'payments': ?instance.payments,
      'bids': ?instance.bids,
    };
