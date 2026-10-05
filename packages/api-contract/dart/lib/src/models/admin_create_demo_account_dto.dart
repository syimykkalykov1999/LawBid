// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'demo_role.dart';

part 'admin_create_demo_account_dto.g.dart';

@JsonSerializable()
class AdminCreateDemoAccountDto {
  const AdminCreateDemoAccountDto({
    required this.role,
    this.withInvite = true,
    this.firstName,
    this.lastName,
    this.label,
  });

  factory AdminCreateDemoAccountDto.fromJson(Map<String, Object?> json) =>
      _$AdminCreateDemoAccountDtoFromJson(json);

  final DemoRole role;
  final String? firstName;
  final String? lastName;
  final String? label;

  /// Also mint a code the blogger enters in the app.
  final bool withInvite;

  Map<String, Object?> toJson() => _$AdminCreateDemoAccountDtoToJson(this);
}
