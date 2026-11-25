/// Row 189 (1:1) and ROUND1 25.11 rows 13 / 30 (groups), WhatsApp /
/// Telegram: while an old message is edited the composer field holds that
/// message, so the unsent text — and in a group the quoted message — waits
/// here and comes back when the edit is saved or closed. One class for the
/// 1:1 chat and the group, so the two composers cannot drift apart again:
/// the first edit puts the draft aside; picking another message to edit
/// meanwhile keeps the draft that is already aside (it never takes the
/// first edited message's text for a draft).
class EditDraftAside<Q> {
  String? _text;
  Q? _quote;

  /// Something is aside (an edit is open).
  bool get holding => _text != null;

  /// An edit starts: [text] (and [quote]) go aside, unless an earlier edit
  /// already put the real draft aside.
  void hold(String text, {Q? quote}) {
    if (_text != null) return;
    _text = text;
    _quote = quote;
  }

  /// The edit ended: what waited, and nothing is aside any more.
  ({String text, Q? quote}) release() {
    final out = (text: _text ?? '', quote: _quote);
    _text = null;
    _quote = null;
    return out;
  }
}
