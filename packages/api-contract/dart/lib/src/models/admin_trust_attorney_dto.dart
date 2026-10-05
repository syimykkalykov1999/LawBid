// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_trust_attorney_dto.g.dart';

@JsonSerializable()
class AdminTrustAttorneyDto {
  const AdminTrustAttorneyDto({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.username,
    required this.verificationStatus,
  });

  factory AdminTrustAttorneyDto.fromJson(Map<String, Object?> json) =>
      _$AdminTrustAttorneyDtoFromJson(json);

  final String id;
  final String? firstName;
  final String? lastName;
  final String username;
  final String verificationStatus;

  Map<String, Object?> toJson() => _$AdminTrustAttorneyDtoToJson(this);
}
