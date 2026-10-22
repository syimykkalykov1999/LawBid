// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'seat_change_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SeatChangeResultDto _$SeatChangeResultDtoFromJson(Map<String, dynamic> json) =>
    SeatChangeResultDto(
      status: SeatChangeResult.fromJson(json['status'] as String),
      clientSecret: json['clientSecret'] as String?,
      amountCents: (json['amountCents'] as num).toInt(),
      currency: json['currency'] as String,
      effectiveAt: json['effectiveAt'] == null
          ? null
          : DateTime.parse(json['effectiveAt'] as String),
      changeId: json['changeId'] as String?,
      overview: SubscriptionMeDto.fromJson(
        json['overview'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$SeatChangeResultDtoToJson(
  SeatChangeResultDto instance,
) => <String, dynamic>{
  'status': instance.status.toJson(),
  'clientSecret': ?instance.clientSecret,
  'amountCents': instance.amountCents,
  'currency': instance.currency,
  'effectiveAt': ?instance.effectiveAt?.toIso8601String(),
  'changeId': ?instance.changeId,
  'overview': instance.overview.toJson(),
};
