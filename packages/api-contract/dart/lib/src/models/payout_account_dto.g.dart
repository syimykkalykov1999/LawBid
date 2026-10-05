// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payout_account_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PayoutAccountDto _$PayoutAccountDtoFromJson(Map<String, dynamic> json) =>
    PayoutAccountDto(
      status: PayoutAccountStatus.fromJson(json['status'] as String),
      canReceive: json['canReceive'] as bool,
      chargesEnabled: json['chargesEnabled'] as bool,
      payoutsEnabled: json['payoutsEnabled'] as bool,
      detailsSubmitted: json['detailsSubmitted'] as bool,
      requirementsDue: (json['requirementsDue'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      disabledReason: json['disabledReason'] as String?,
      available: json['available'] as bool,
      processingFeePayer: ProcessingFeePayer.fromJson(
        json['processingFeePayer'] as String,
      ),
      processingFeePayerIsDefault: json['processingFeePayerIsDefault'] as bool,
      updatedAt: json['updatedAt'] == null
          ? null
          : DateTime.parse(json['updatedAt'] as String),
    );

Map<String, dynamic> _$PayoutAccountDtoToJson(PayoutAccountDto instance) =>
    <String, dynamic>{
      'status': instance.status.toJson(),
      'canReceive': instance.canReceive,
      'chargesEnabled': instance.chargesEnabled,
      'payoutsEnabled': instance.payoutsEnabled,
      'detailsSubmitted': instance.detailsSubmitted,
      'requirementsDue': instance.requirementsDue,
      'disabledReason': ?instance.disabledReason,
      'available': instance.available,
      'processingFeePayer': instance.processingFeePayer.toJson(),
      'processingFeePayerIsDefault': instance.processingFeePayerIsDefault,
      'updatedAt': ?instance.updatedAt?.toIso8601String(),
    };
