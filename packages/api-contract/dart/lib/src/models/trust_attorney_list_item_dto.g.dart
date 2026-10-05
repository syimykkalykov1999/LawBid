// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_attorney_list_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustAttorneyListItemDto _$TrustAttorneyListItemDtoFromJson(
  Map<String, dynamic> json,
) => TrustAttorneyListItemDto(
  attorney: AdminTrustAttorneyDto.fromJson(
    json['attorney'] as Map<String, dynamic>,
  ),
  level: (json['level'] as num).toInt(),
  badgeStatus: TrustAttorneyListItemDtoBadgeStatus.fromJson(
    json['badgeStatus'] as String,
  ),
  badge: json['badge'] as bool,
  missing: (json['missing'] as List<dynamic>)
      .map((e) => TrustAttorneyListItemDtoMissing.fromJson(e as String))
      .toList(),
  reasons: (json['reasons'] as List<dynamic>)
      .map((e) => TrustAttorneyListItemDtoReasons.fromJson(e as String))
      .toList(),
  holds: TrustHoldsDto.fromJson(json['holds'] as Map<String, dynamic>),
  staffClearedAt: json['staffClearedAt'] == null
      ? null
      : DateTime.parse(json['staffClearedAt'] as String),
  staffClearedBy: json['staffClearedBy'] == null
      ? null
      : StaffAdminDto.fromJson(json['staffClearedBy'] as Map<String, dynamic>),
  documentsRequestedAt: json['documentsRequestedAt'] == null
      ? null
      : DateTime.parse(json['documentsRequestedAt'] as String),
  complaintsTotal: (json['complaintsTotal'] as num).toInt(),
  lookups: (json['lookups'] as List<dynamic>)
      .map((e) => BarLookupDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  blocked: json['blocked'] as bool,
);

Map<String, dynamic> _$TrustAttorneyListItemDtoToJson(
  TrustAttorneyListItemDto instance,
) => <String, dynamic>{
  'attorney': instance.attorney.toJson(),
  'level': instance.level,
  'badgeStatus': instance.badgeStatus.toJson(),
  'badge': instance.badge,
  'missing': instance.missing.map((e) => e.toJson()).toList(),
  'reasons': instance.reasons.map((e) => e.toJson()).toList(),
  'holds': instance.holds.toJson(),
  'staffClearedAt': ?instance.staffClearedAt?.toIso8601String(),
  'staffClearedBy': ?instance.staffClearedBy?.toJson(),
  'documentsRequestedAt': ?instance.documentsRequestedAt?.toIso8601String(),
  'complaintsTotal': instance.complaintsTotal,
  'lookups': instance.lookups.map((e) => e.toJson()).toList(),
  'blocked': instance.blocked,
};
