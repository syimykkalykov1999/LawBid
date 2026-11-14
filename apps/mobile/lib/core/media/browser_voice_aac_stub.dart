/// Not a browser: the phones record AAC themselves; nothing to convert.
Future<String?> browserVoiceToAac(
  String url, {
  required int bitRate,
  required int sampleRate,
}) async =>
    null;
