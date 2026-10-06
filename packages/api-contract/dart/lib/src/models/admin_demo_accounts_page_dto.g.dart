// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_demo_accounts_page_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDemoAccountsPageDto _$AdminDemoAccountsPageDtoFromJson(
  Map<String, dynamic> json,
) => AdminDemoAccountsPageDto(
  items: (json['items'] as List<dynamic>)
      .map((e) => AdminDemoAccountDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  total: json['total'] as num,
);

Map<String, dynamic> _$AdminDemoAccountsPageDtoToJson(
  AdminDemoAccountsPageDto instance,
) => <String, dynamic>{
  'items': instance.items.map((e) => e.toJson()).toList(),
  'total': instance.total,
};
