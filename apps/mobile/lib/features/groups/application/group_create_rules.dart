/// Limits of a new group (apps/api/src/modules/groups/groups.dto.ts).
const groupTitleMax = 80;
const groupDescriptionMax = 500;

/// GROUP_USERNAME_RE: a letter, then letters / digits / underscores; 5-32.
final groupUsernameRe = RegExp(r'^[A-Za-z][A-Za-z0-9_]{4,31}$');
const groupUsernameMax = 32;
const groupUsernameMin = 5;

/// Why a public-group @username cannot be used yet.
enum GroupUsernameIssue { startsWithLetter, badChars, tooShort, tooLong }

/// null = a valid @username (also accepts a leading @, which is not part of
/// it). An empty text is [GroupUsernameIssue.tooShort].
GroupUsernameIssue? groupUsernameIssue(String input) {
  final v = input.startsWith('@') ? input.substring(1) : input;
  if (v.isNotEmpty && !RegExp('^[A-Za-z]').hasMatch(v)) {
    return GroupUsernameIssue.startsWithLetter;
  }
  // No `__`, no trailing `_` (the server's rule, as Telegram).
  if (!RegExp(r'^[A-Za-z0-9_]*$').hasMatch(v) ||
      v.contains('__') ||
      v.endsWith('_')) {
    return GroupUsernameIssue.badChars;
  }
  if (v.length > groupUsernameMax) return GroupUsernameIssue.tooLong;
  if (v.length < groupUsernameMin) return GroupUsernameIssue.tooShort;
  return null;
}
