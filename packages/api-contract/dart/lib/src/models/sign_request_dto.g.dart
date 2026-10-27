// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sign_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SignRequestDto _$SignRequestDtoFromJson(Map<String, dynamic> json) =>
    SignRequestDto(
      id: json['id'] as String,
      title: json['title'] as String,
      status: SignRequestDtoStatus.fromJson(json['status'] as String),
      createdByRole: SignRequestDtoCreatedByRole.fromJson(
        json['createdByRole'] as String,
      ),
      createdAt: DateTime.parse(json['createdAt'] as String),
      completedAt: json['completedAt'] == null
          ? null
          : DateTime.parse(json['completedAt'] as String),
      sourceUrl: json['sourceUrl'] as String?,
      finalUrl: json['finalUrl'] as String?,
      sourceSha256: json['sourceSha256'] as String,
      finalSha256: json['finalSha256'] as String?,
      signatures: (json['signatures'] as List<dynamic>)
          .map((e) => SignatureDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      canSign: json['canSign'] as bool,
      canDecline: json['canDecline'] as bool,
      canCancel: json['canCancel'] as bool,
      declinedByRole: json['declinedByRole'] == null
          ? null
          : SignRequestDtoDeclinedByRole.fromJson(
              json['declinedByRole'] as String,
            ),
      declineReason: json['declineReason'] as String?,
      expiresAt: json['expiresAt'] == null
          ? null
          : DateTime.parse(json['expiresAt'] as String),
      expired: json['expired'] as bool,
      remindersSent: json['remindersSent'] as num,
      lastRemindedAt: json['lastRemindedAt'] == null
          ? null
          : DateTime.parse(json['lastRemindedAt'] as String),
      views: (json['views'] as List<dynamic>)
          .map((e) => SignViewDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      canResend: json['canResend'] as bool,
    );

Map<String, dynamic> _$SignRequestDtoToJson(SignRequestDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'status': instance.status.toJson(),
      'createdByRole': instance.createdByRole.toJson(),
      'createdAt': instance.createdAt.toIso8601String(),
      'completedAt': ?instance.completedAt?.toIso8601String(),
      'sourceUrl': ?instance.sourceUrl,
      'finalUrl': ?instance.finalUrl,
      'sourceSha256': instance.sourceSha256,
      'finalSha256': ?instance.finalSha256,
      'signatures': instance.signatures.map((e) => e.toJson()).toList(),
      'canSign': instance.canSign,
      'canDecline': instance.canDecline,
      'canCancel': instance.canCancel,
      'declinedByRole': ?instance.declinedByRole?.toJson(),
      'declineReason': ?instance.declineReason,
      'expiresAt': ?instance.expiresAt?.toIso8601String(),
      'expired': instance.expired,
      'remindersSent': instance.remindersSent,
      'lastRemindedAt': ?instance.lastRemindedAt?.toIso8601String(),
      'views': instance.views.map((e) => e.toJson()).toList(),
      'canResend': instance.canResend,
    };
