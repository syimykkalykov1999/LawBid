// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'demo_role.dart';

part 'create_demo_account_dto.g.dart';

@JsonSerializable()
class CreateDemoAccountDto {
  const CreateDemoAccountDto({
    required this.role,
    this.firstName,
    this.lastName,
  });

  factory CreateDemoAccountDto.fromJson(Map<String, Object?> json) =>
      _$CreateDemoAccountDtoFromJson(json);

  final DemoRole role;
  final String? firstName;
  final String? lastName;

  Map<String, Object?> toJson() => _$CreateDemoAccountDtoToJson(this);
}
