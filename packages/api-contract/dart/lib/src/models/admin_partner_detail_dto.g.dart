// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_partner_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPartnerDetailDto _$AdminPartnerDetailDtoFromJson(
  Map<String, dynamic> json,
) => AdminPartnerDetailDto(
  partner: AdminPartnerRowDto.fromJson(json['partner'] as Map<String, dynamic>),
  referred: (json['referred'] as List<dynamic>)
      .map(
        (e) => AdminPartnerReferredUserDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  commissions: (json['commissions'] as List<dynamic>)
      .map(
        (e) => AdminPartnerCommissionRowDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
);

Map<String, dynamic> _$AdminPartnerDetailDtoToJson(
  AdminPartnerDetailDto instance,
) => <String, dynamic>{
  'partner': instance.partner.toJson(),
  'referred': instance.referred.map((e) => e.toJson()).toList(),
  'commissions': instance.commissions.map((e) => e.toJson()).toList(),
};
