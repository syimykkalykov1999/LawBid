// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_signals_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustSignalsDto _$TrustSignalsDtoFromJson(Map<String, dynamic> json) =>
    TrustSignalsDto(
      selfAttested: json['selfAttested'] as bool,
      licenseConfirmed: json['licenseConfirmed'] as bool,
      licenseConfirmedBy: json['licenseConfirmedBy'] == null
          ? null
          : TrustSignalsDtoLicenseConfirmedBy.fromJson(
              json['licenseConfirmedBy'] as String,
            ),
      documentsVerified: json['documentsVerified'] as bool,
      stripeKyc: json['stripeKyc'] as bool,
      stripeIdentity: json['stripeIdentity'] as bool,
      identityConfirmed: json['identityConfirmed'] as bool,
      nameCheck: TrustSignalsDtoNameCheck.fromJson(json['nameCheck'] as String),
      firmLinkConfirmed: json['firmLinkConfirmed'] as bool,
    );

Map<String, dynamic> _$TrustSignalsDtoToJson(TrustSignalsDto instance) =>
    <String, dynamic>{
      'selfAttested': instance.selfAttested,
      'licenseConfirmed': instance.licenseConfirmed,
      'licenseConfirmedBy': ?instance.licenseConfirmedBy?.toJson(),
      'documentsVerified': instance.documentsVerified,
      'stripeKyc': instance.stripeKyc,
      'stripeIdentity': instance.stripeIdentity,
      'identityConfirmed': instance.identityConfirmed,
      'nameCheck': instance.nameCheck.toJson(),
      'firmLinkConfirmed': instance.firmLinkConfirmed,
    };
