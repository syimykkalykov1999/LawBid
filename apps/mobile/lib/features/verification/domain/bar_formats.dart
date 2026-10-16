// GENERATED from apps/api/src/modules/verification/bar-number-format.ts
// (DEFAULT_BAR_FORMATS, research 2026-10-16). Instant, soft feedback only:
// the server decides, and a number that does not fit is never refused (it goes
// to manual review with the bar card). The admin's overrides are server-side.
const Map<String, ({String pattern, String example})> kBarFormats = {
  'AK': (pattern: r'^\d{5,7}$', example: '0306032'),
  'AL': (
    pattern: r'^(?:((ASB)?\d{4}[A-Z]\d{2}[A-Z]|[A-Z]{3}\d{3}))$',
    example: 'ASB1234A56B'
  ),
  'AR': (pattern: r'^\d{5,7}$', example: '91251'),
  'AZ': (pattern: r'^\d{4,6}$', example: '012345'),
  'CA': (pattern: r'^(?:\d{3,7}|\d{5,6})$', example: '147639'),
  'CO': (pattern: r'^\d{2,6}$', example: '12345'),
  'CT': (pattern: r'^\d{5,6}$', example: '439227'),
  'DC': (pattern: r'^\d{3,7}$', example: '482345'),
  'DE': (pattern: r'^\d{3,6}$', example: '5123'),
  'FL': (pattern: r'^(?:\d{1,7}|\d{5,7})$', example: '682101'),
  'GA': (pattern: r'^(?:\d{3,6}|\d{5,6})$', example: '120708'),
  'HI': (pattern: r'^\d{2,5}$', example: '4417'),
  'IA': (pattern: r'^(AT)?\d{4,7}$', example: 'AT0012345'),
  'ID': (pattern: r'^\d{3,5}$', example: '7890'),
  'IL': (pattern: r'^(?:\d{7}|\d{6,7})$', example: '6123456'),
  'IN': (pattern: r'^\d{5,8}$', example: '1234567'),
  'KS': (pattern: r'^\d{4,6}$', example: '12345'),
  'KY': (pattern: r'^\d{5,6}$', example: '12345'),
  'LA': (pattern: r'^\d{4,6}$', example: '12345'),
  'MA': (pattern: r'^(?:\d{4,6}|\d{6})$', example: '654321'),
  'MD': (pattern: r'^\d{8,10}$', example: '8712010123'),
  'ME': (pattern: r'^\d{4,6}$', example: '009114'),
  'MI': (pattern: r'^(?:P?\d{4,6}|P\d{5})$', example: 'P56818'),
  'MN': (pattern: r'^\d{1,7}$', example: '0123456'),
  'MO': (pattern: r'^\d{4,6}(MO)?$', example: '12345'),
  'MS': (pattern: r'^\d{3,6}$', example: '101234'),
  'MT': (pattern: r'^\d{3,6}$', example: '11525'),
  'NC': (pattern: r'^\d{3,6}$', example: '12345'),
  'ND': (pattern: r'^\d{4,6}$', example: '04891'),
  'NE': (pattern: r'^\d{4,6}$', example: '24567'),
  'NH': (pattern: r'^\d{3,6}$', example: '18429'),
  'NJ': (pattern: r'^(?:(\d{8,9}|PHV\d{4,8})|\d{9})$', example: '031711990'),
  'NM': (pattern: r'^\d{3,6}$', example: '14500'),
  'NV': (pattern: r'^\d{3,6}$', example: '12345'),
  'NY': (pattern: r'^(?:[1-9]\d{6}|\d{4,7})$', example: '4567890'),
  'OH': (pattern: r'^(?:\d{5,7}|\d{7})$', example: '0012345'),
  'OK': (pattern: r'^\d{3,6}$', example: '12345'),
  'OR': (pattern: r'^\d{4,6}$', example: '140789'),
  'PA': (pattern: r'^(?:\d{3,6}|\d{5,6})$', example: '123456'),
  'RI': (pattern: r'^\d{3,6}$', example: '7654'),
  'SC': (pattern: r'^\d{3,6}$', example: '12345'),
  'SD': (pattern: r'^\d{2,6}$', example: '4567'),
  'TN': (pattern: r'^\d{4,6}$', example: '035557'),
  'TX': (pattern: r'^(?:\d{5,8}|\d{8})$', example: '24012345'),
  'UT': (pattern: r'^\d{3,6}$', example: '16800'),
  'VA': (pattern: r'^\d{3,7}$', example: '12345'),
  'VT': (pattern: r'^\d{3,7}$', example: '4381'),
  'WA': (pattern: r'^(?:\d{3,6}|\d{4,6})$', example: '45678'),
  'WI': (pattern: r'^\d{6,7}$', example: '1042958'),
  'WV': (pattern: r'^\d{3,6}$', example: '12345'),
  'WY': (pattern: r'^[1-9]\d{4}$', example: '75749'),
};

/// Whether [raw] looks like a usual bar number of [state] (separators and case
/// ignored). Unknown states and broken rules count as fitting.
bool barNumberFitsState(String state, String raw) {
  final f = kBarFormats[state.toUpperCase()];
  if (f == null) return true;
  final n = raw.trim().toUpperCase().replaceAll(RegExp(r'[\s./-]'), '');
  try {
    return RegExp(f.pattern).hasMatch(n);
  } on FormatException {
    return true;
  }
}
