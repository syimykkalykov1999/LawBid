// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_user_contacts_dto.g.dart';

@JsonSerializable()
class AdminUserContactsDto {
  const AdminUserContactsDto({
    required this.email,
    required this.emailVerifiedAt,
    required this.phone,
    required this.phoneVerifiedAt,
    required this.preferredContactNote,
  });

  factory AdminUserContactsDto.fromJson(Map<String, Object?> json) =>
      _$AdminUserContactsDtoFromJson(json);

  final String? email;
  final DateTime? emailVerifiedAt;
  final String? phone;
  final DateTime? phoneVerifiedAt;
  final String? preferredContactNote;

  Map<String, Object?> toJson() => _$AdminUserContactsDtoToJson(this);
}
