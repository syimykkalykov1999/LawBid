// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum HealthItemDtoKey {
  @JsonValue('api')
  api('api'),
  @JsonValue('worker')
  worker('worker'),
  @JsonValue('database')
  database('database'),
  @JsonValue('redis')
  redis('redis'),
  @JsonValue('storage')
  storage('storage'),
  @JsonValue('video')
  video('video'),
  @JsonValue('queues')
  queues('queues'),
  @JsonValue('backup')
  backup('backup'),
  @JsonValue('cost')
  cost('cost'),
  @JsonValue('message_keys')
  messageKeys('message_keys'),
  @JsonValue('secret_rotation')
  secretRotation('secret_rotation'),
  @JsonValue('stripe_webhooks')
  stripeWebhooks('stripe_webhooks'),
  @JsonValue('push')
  push('push'),
  @JsonValue('turn')
  turn('turn'),
  @JsonValue('cloudflare_turn')
  cloudflareTurn('cloudflare_turn'),
  @JsonValue('cloudflare_sfu')
  cloudflareSfu('cloudflare_sfu'),
  @JsonValue('r2')
  r2('r2'),
  @JsonValue('http')
  http('http'),
  @JsonValue('realtime')
  realtime('realtime'),
  @JsonValue('breakers')
  breakers('breakers'),
  @JsonValue('cloudflare_usage')
  cloudflareUsage('cloudflare_usage'),
  @JsonValue('bunny_usage')
  bunnyUsage('bunny_usage'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const HealthItemDtoKey(this.json);

  factory HealthItemDtoKey.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;
  String toJson() {
    final value = json;
    if (value == null) {
      throw StateError(
        'Cannot convert enum value with null JSON representation to String. '
        'This usually happens for \$unknown or @JsonValue(null) entries.',
      );
    }
    return value as String;
  }

  @override
  String toString() => json?.toString() ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<HealthItemDtoKey> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
