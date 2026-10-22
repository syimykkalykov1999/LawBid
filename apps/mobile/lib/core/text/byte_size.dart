/// "12.4 MB", "830 KB", "1.2 GB" — the size of a file or a cache.
/// Owner 2026-10-22 (client economy plan §5): one formatter for the chat
/// files and «Данные и память».
String byteSizeLabel(int? bytes) {
  if (bytes == null) return '';
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  if (bytes >= gb) return '${(bytes / gb).toStringAsFixed(1)} GB';
  if (bytes >= mb) return '${(bytes / mb).toStringAsFixed(1)} MB';
  return '${(bytes / kb).ceil()} KB';
}
