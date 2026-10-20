// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contact_person_dto_role.dart';

part 'contact_person_dto.g.dart';

@JsonSerializable()
class ContactPersonDto {
  const ContactPersonDto({
    required this.hash,
    required this.userId,
    required this.displayName,
    this.username,
    this.avatarUrl,
    this.role,
  });

  factory ContactPersonDto.fromJson(Map<String, Object?> json) =>
      _$ContactPersonDtoFromJson(json);

  /// The hash of this upload that matched, so the app can find the phone-book name locally.
  final String hash;
  final String userId;
  final String? username;

  /// Attorneys: full public name. Clients: first name only, no username.
  final String displayName;
  final String? avatarUrl;
  final ContactPersonDtoRole? role;

  Map<String, Object?> toJson() => _$ContactPersonDtoToJson(this);
}
