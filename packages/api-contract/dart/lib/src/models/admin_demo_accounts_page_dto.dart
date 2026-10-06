// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_demo_account_dto.dart';

part 'admin_demo_accounts_page_dto.g.dart';

@JsonSerializable()
class AdminDemoAccountsPageDto {
  const AdminDemoAccountsPageDto({required this.items, required this.total});

  factory AdminDemoAccountsPageDto.fromJson(Map<String, Object?> json) =>
      _$AdminDemoAccountsPageDtoFromJson(json);

  final List<AdminDemoAccountDto> items;
  final num total;

  Map<String, Object?> toJson() => _$AdminDemoAccountsPageDtoToJson(this);
}
