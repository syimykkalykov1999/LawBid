// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'subscription_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SubscriptionDto _$SubscriptionDtoFromJson(Map<String, dynamic> json) =>
    SubscriptionDto(
      id: json['id'] as String,
      status: SubscriptionDtoStatus.fromJson(json['status'] as String),
      isActive: json['isActive'] as bool,
      priceCents: (json['priceCents'] as num).toInt(),
      trialEndsAt: json['trialEndsAt'] == null
          ? null
          : DateTime.parse(json['trialEndsAt'] as String),
      currentPeriodEnd: json['currentPeriodEnd'] == null
          ? null
          : DateTime.parse(json['currentPeriodEnd'] as String),
      cancelAtPeriodEnd: json['cancelAtPeriodEnd'] as bool,
      canceledAt: json['canceledAt'] == null
          ? null
          : DateTime.parse(json['canceledAt'] as String),
      graceEndsAt: json['graceEndsAt'] == null
          ? null
          : DateTime.parse(json['graceEndsAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$SubscriptionDtoToJson(SubscriptionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'status': instance.status.toJson(),
      'isActive': instance.isActive,
      'priceCents': instance.priceCents,
      'trialEndsAt': ?instance.trialEndsAt?.toIso8601String(),
      'currentPeriodEnd': ?instance.currentPeriodEnd?.toIso8601String(),
      'cancelAtPeriodEnd': instance.cancelAtPeriodEnd,
      'canceledAt': ?instance.canceledAt?.toIso8601String(),
      'graceEndsAt': ?instance.graceEndsAt?.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
