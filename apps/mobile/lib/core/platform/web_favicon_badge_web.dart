import 'dart:js_interop';
import 'dart:js_interop_unsafe';

/// Owner row 113: the unread number on the tab's icon, drawn by Tinycon
/// 0.6.8 (MIT, web/tinycon.js, loaded by index.html; THIRD_PARTY_NOTICES).
/// Tinycon's own title fallback is off: the tab title belongs to Flutter's
/// `Title` («(3) LawBid»). No Tinycon on the page: nothing happens.
void setFaviconBadge(
  int count, {
  required String background,
  required String color,
}) {
  final tinycon = globalContext.getProperty<JSObject?>('Tinycon'.toJS);
  if (tinycon == null) return;
  tinycon.callMethod<JSAny?>(
    'setOptions'.toJS,
    {'background': background, 'color': color, 'fallback': false}.jsify(),
  );
  if (count > 0) {
    tinycon.callMethod<JSAny?>('setBubble'.toJS, count.toJS);
  } else {
    tinycon.callMethod<JSAny?>('reset'.toJS);
  }
}
