import 'package:flutter/foundation.dart';

/// The bid form's route `extra` from a hotline call (mockup a8): what the
/// «Дело из звонка» card says, and the client's budget to start from.
@immutable
class BidFromCall {
  const BidFromCall({
    required this.topic,
    required this.state,
    this.budgetCents,
  });

  final String topic;
  final String state;
  final int? budgetCents;
}
