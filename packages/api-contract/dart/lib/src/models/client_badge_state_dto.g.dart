// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_badge_state_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientBadgeStateDto _$ClientBadgeStateDtoFromJson(Map<String, dynamic> json) =>
    ClientBadgeStateDto(
      status: ClientBadgeStatus.fromJson(json['status'] as String),
      badgeActive: json['badgeActive'] as bool,
      priceCents: (json['priceCents'] as num).toInt(),
      currency: json['currency'] as String,
      canSubmit: json['canSubmit'] as bool,
      canSubscribe: json['canSubscribe'] as bool,
      subscription: json['subscription'] == null
          ? null
          : ClientBadgeSubscriptionDto.fromJson(
              json['subscription'] as Map<String, dynamic>,
            ),
      submittedAt: json['submittedAt'] as String?,
      rejectReason: json['rejectReason'] as String?,
      revokeReason: json['revokeReason'] as String?,
    );

Map<String, dynamic> _$ClientBadgeStateDtoToJson(
  ClientBadgeStateDto instance,
) => <String, dynamic>{
  'status': instance.status.toJson(),
  'badgeActive': instance.badgeActive,
  'priceCents': instance.priceCents,
  'currency': instance.currency,
  'canSubmit': instance.canSubmit,
  'canSubscribe': instance.canSubscribe,
  'subscription': ?instance.subscription?.toJson(),
  'submittedAt': ?instance.submittedAt,
  'rejectReason': ?instance.rejectReason,
  'revokeReason': ?instance.revokeReason,
};
