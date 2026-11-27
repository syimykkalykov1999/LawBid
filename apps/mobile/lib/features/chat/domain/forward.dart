import 'package:flutter/foundation.dart';

/// Owner 2026-10-21 (Telegram / WhatsApp «Переслать»): what is forwarded —
/// a direct / case chat message, a group message, or (for a group that
/// restricts saving content) its link.
enum ForwardSourceKind {
  message,
  groupMessage,
  groupLink,
}

@immutable
class ForwardSource {
  const ForwardSource(this.kind, this.id);

  const ForwardSource.message(this.id) : kind = ForwardSourceKind.message;

  final ForwardSourceKind kind;
  final String id;

  @override
  bool operator ==(Object other) =>
      other is ForwardSource && other.kind == kind && other.id == id;

  @override
  int get hashCode => Object.hash(kind, id);
}

/// Where to: a direct / case chat, a group (a forum group: its «General»
/// unless a topic is given).
enum ForwardTargetKind { conversation, group }

@immutable
class ForwardTarget {
  const ForwardTarget(this.kind, this.id, {this.topicId});

  final ForwardTargetKind kind;
  final String id;
  final String? topicId;

  @override
  bool operator ==(Object other) =>
      other is ForwardTarget &&
      other.kind == kind &&
      other.id == id &&
      other.topicId == topicId;

  @override
  int get hashCode => Object.hash(kind, id, topicId);
}

/// One message × chat pair of a forward: sent, or refused by that chat
/// with the server's error [code].
@immutable
class ForwardResult {
  const ForwardResult({
    required this.target,
    required this.sourceId,
    required this.sent,
    this.code,
    this.messageId,
  });

  final ForwardTarget target;
  final String sourceId;
  final bool sent;
  final String? code;
  final String? messageId;
}

/// The server's limits for one forward.
const kForwardMaxSources = 50;
const kForwardMaxTargets = 20;
