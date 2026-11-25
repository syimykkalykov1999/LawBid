import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// A button another feature puts just above the «+» of «Вопросы» (owner
/// row 87, hotline mockup v4 c1: the call button). «Вопросы» does not know
/// that feature; it draws what this slot holds (nothing by default).
class QaFeedFabSlot extends Notifier<WidgetBuilder?> {
  @override
  WidgetBuilder? build() => null;

  // ignore: use_setters_to_change_properties
  void set(WidgetBuilder? builder) => state = builder;
}

final qaFeedFabSlotProvider =
    NotifierProvider<QaFeedFabSlot, WidgetBuilder?>(QaFeedFabSlot.new);
