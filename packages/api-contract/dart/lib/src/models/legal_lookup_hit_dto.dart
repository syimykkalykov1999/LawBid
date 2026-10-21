// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'legal_lookup_hit_dto.g.dart';

@JsonSerializable()
class LegalLookupHitDto {
  const LegalLookupHitDto({
    required this.userId,
    required this.name,
    required this.role,
    required this.status,
    required this.phone,
    required this.email,
    required this.username,
    required this.matchedBy,
  });

  factory LegalLookupHitDto.fromJson(Map<String, Object?> json) =>
      _$LegalLookupHitDtoFromJson(json);

  final String userId;
  final String? name;
  final String? role;
  final String status;
  final String? phone;
  final String? email;
  final String? username;

  /// id | phone | email | username | name
  final String matchedBy;

  Map<String, Object?> toJson() => _$LegalLookupHitDtoToJson(this);
}
