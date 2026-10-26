import 'package:flutter/widgets.dart';

/// Phones get their insets from the system: nothing to measure.
EdgeInsets? readSafeAreaInsets() => null;

/// Nothing to listen to outside the browser.
void Function() onViewportChange(VoidCallback listener) => () {};
