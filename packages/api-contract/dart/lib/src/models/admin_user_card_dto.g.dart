// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_user_card_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUserCardDto _$AdminUserCardDtoFromJson(Map<String, dynamic> json) =>
    AdminUserCardDto(
      id: json['id'] as String,
      role: json['role'] as String?,
      status: json['status'] as String,
      suspendedReason: json['suspendedReason'] as String?,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      uiLanguage: json['uiLanguage'] as String,
      hasEmail: json['hasEmail'] as bool,
      hasPhone: json['hasPhone'] as bool,
      createdAt: DateTime.parse(json['createdAt'] as String),
      deletedAt: json['deletedAt'] == null
          ? null
          : DateTime.parse(json['deletedAt'] as String),
      attorney: json['attorney'] == null
          ? null
          : AdminAttorneyCardDto.fromJson(
              json['attorney'] as Map<String, dynamic>,
            ),
      client: json['client'] == null
          ? null
          : AdminClientCardDto.fromJson(json['client'] as Map<String, dynamic>),
      sessions: (json['sessions'] as List<dynamic>)
          .map((e) => AdminUserSessionDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      cases: (json['cases'] as List<dynamic>)
          .map((e) => AdminUserCaseDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      bids: (json['bids'] as List<dynamic>)
          .map((e) => AdminUserBidDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      warnings: (json['warnings'] as num).toInt(),
    );

Map<String, dynamic> _$AdminUserCardDtoToJson(AdminUserCardDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'role': ?instance.role,
      'status': instance.status,
      'suspendedReason': ?instance.suspendedReason,
      'firstName': ?instance.firstName,
      'lastName': ?instance.lastName,
      'avatarUrl': ?instance.avatarUrl,
      'uiLanguage': instance.uiLanguage,
      'hasEmail': instance.hasEmail,
      'hasPhone': instance.hasPhone,
      'createdAt': instance.createdAt.toIso8601String(),
      'deletedAt': ?instance.deletedAt?.toIso8601String(),
      'attorney': ?instance.attorney?.toJson(),
      'client': ?instance.client?.toJson(),
      'sessions': instance.sessions.map((e) => e.toJson()).toList(),
      'cases': instance.cases.map((e) => e.toJson()).toList(),
      'bids': instance.bids.map((e) => e.toJson()).toList(),
      'warnings': instance.warnings,
    };
