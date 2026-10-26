// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bar_number_block_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BarNumberBlockDto _$BarNumberBlockDtoFromJson(Map<String, dynamic> json) =>
    BarNumberBlockDto(
      id: json['id'] as String,
      stateCode: json['stateCode'] as String,
      barNumber: json['barNumber'] as String,
      active: json['active'] as bool,
      reason: json['reason'] as String,
      source: BarNumberBlockDtoSource.fromJson(json['source'] as String),
      attorney: json['attorney'] == null
          ? null
          : AdminTrustAttorneyDto.fromJson(
              json['attorney'] as Map<String, dynamic>,
            ),
      blockedBy: json['blockedBy'] == null
          ? null
          : StaffAdminDto.fromJson(json['blockedBy'] as Map<String, dynamic>),
      blockedAt: DateTime.parse(json['blockedAt'] as String),
      blockContacts: json['blockContacts'] as bool,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      unblockedAt: json['unblockedAt'] == null
          ? null
          : DateTime.parse(json['unblockedAt'] as String),
      unblockedBy: json['unblockedBy'] == null
          ? null
          : StaffAdminDto.fromJson(json['unblockedBy'] as Map<String, dynamic>),
      unblockReason: json['unblockReason'] as String?,
      attempts: (json['attempts'] as num).toInt(),
      lastAttemptAt: json['lastAttemptAt'] == null
          ? null
          : DateTime.parse(json['lastAttemptAt'] as String),
      lookupUrl: json['lookupUrl'] as String?,
      events: (json['events'] as List<dynamic>)
          .map(
            (e) => BarNumberBlockEventDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
    );

Map<String, dynamic> _$BarNumberBlockDtoToJson(BarNumberBlockDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'stateCode': instance.stateCode,
      'barNumber': instance.barNumber,
      'active': instance.active,
      'reason': instance.reason,
      'source': instance.source.toJson(),
      'attorney': ?instance.attorney?.toJson(),
      'blockedBy': ?instance.blockedBy?.toJson(),
      'blockedAt': instance.blockedAt.toIso8601String(),
      'blockContacts': instance.blockContacts,
      'email': ?instance.email,
      'phone': ?instance.phone,
      'unblockedAt': ?instance.unblockedAt?.toIso8601String(),
      'unblockedBy': ?instance.unblockedBy?.toJson(),
      'unblockReason': ?instance.unblockReason,
      'attempts': instance.attempts,
      'lastAttemptAt': ?instance.lastAttemptAt?.toIso8601String(),
      'lookupUrl': ?instance.lookupUrl,
      'events': instance.events.map((e) => e.toJson()).toList(),
    };
