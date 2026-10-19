import 'package:lawbid/core/text/tidy_text.dart';

/// The longest title a post keeps (the server's limit for `title`).
const kPostTitleMaxChars = 120;

/// Owner 2026-10-18: ONE rule for a post's title, used when publishing and
/// when showing a post that has no stored title: the first line is the
/// title, the rest is the text. A first line longer than
/// [kPostTitleMaxChars] is cut at a word and its rest starts the text. No
/// line break: the whole (short) text is the title.
(String, String) splitPostText(String raw) {
  final s = tidyText(raw).trim();
  final nl = s.indexOf('\n');
  var title = (nl < 0 ? s : s.substring(0, nl)).trim();
  var body = nl < 0 ? '' : s.substring(nl + 1).trim();
  if (title.length > kPostTitleMaxChars) {
    var cut = title.lastIndexOf(' ', kPostTitleMaxChars);
    if (cut <= 0) cut = kPostTitleMaxChars;
    final rest = title.substring(cut).trim();
    title = title.substring(0, cut).trim();
    body = [rest, body].where((x) => x.isNotEmpty).join('\n');
  }
  return (title, body);
}
