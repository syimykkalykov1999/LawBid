// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fraud_linked_account_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FraudLinkedAccountDto _$FraudLinkedAccountDtoFromJson(
  Map<String, dynamic> json,
) => FraudLinkedAccountDto(
  user: FraudUserDto.fromJson(json['user'] as Map<String, dynamic>),
  kinds: (json['kinds'] as List<dynamic>)
      .map((e) => FingerprintKind.fromJson(e as String))
      .toList(),
  blocked: json['blocked'] as bool,
);

Map<String, dynamic> _$FraudLinkedAccountDtoToJson(
  FraudLinkedAccountDto instance,
) => <String, dynamic>{
  'user': instance.user.toJson(),
  'kinds': instance.kinds.map((e) => e.toJson()).toList(),
  'blocked': instance.blocked,
};
