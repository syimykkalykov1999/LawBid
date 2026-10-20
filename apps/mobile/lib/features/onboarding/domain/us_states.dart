import 'package:lawbid/core/text/search_fold.dart';
import 'package:lawbid/features/onboarding/domain/region_catalog.dart';

export 'package:lawbid/features/onboarding/domain/region_catalog.dart';

/// Owner 2026-10-05: the regions people pick (profile, cases, licenses,
/// filters) are those of every switched-on country, not only the USA.
List<UsState> get kRegions => RegionCatalog.regions;

/// 50 states + DC (docs/01_FOUNDATION_AUTH.md §11 Шаг 3A "штат проживания
/// (список 50+DC)"). A local copy of apps/api/src/common/reference-data/
/// us-states.ts: there is no public `/states` endpoint yet (docs/02
/// §3.1 seeds the table, file 04 exposes it). Names are proper nouns —
/// reference data, not UI copy — so they are not routed through `t()`.
class UsState {
  const UsState(this.code, this.name);

  final String code;
  final String name;

  /// Owner 2026-10-18: other names people type for it («Нью-Йорк»,
  /// «Калифорния») — matched by the pickers' search, never shown.
  List<String> get aliases => kUsStateAliases[code] ?? const [];

  /// Whether [query] finds this region (name, code, aliases — any
  /// alphabet, small typos; see core/text/search_fold.dart).
  bool matches(String query) =>
      query.trim().isEmpty ||
      code.toLowerCase() == query.trim().toLowerCase() ||
      textMatches(query, [name, ...aliases]);
}

/// Russian names of the states (owner 2026-10-18: "Russian state names").
const Map<String, List<String>> kUsStateAliases = {
  'AL': ['Алабама'],
  'AK': ['Аляска'],
  'AZ': ['Аризона'],
  'AR': ['Арканзас'],
  'CA': ['Калифорния'],
  'CO': ['Колорадо'],
  'CT': ['Коннектикут'],
  'DE': ['Делавэр', 'Делавер'],
  'DC': ['Округ Колумбия', 'Вашингтон округ Колумбия'],
  'FL': ['Флорида'],
  'GA': ['Джорджия'],
  'HI': ['Гавайи'],
  'ID': ['Айдахо'],
  'IL': ['Иллинойс'],
  'IN': ['Индиана'],
  'IA': ['Айова'],
  'KS': ['Канзас'],
  'KY': ['Кентукки'],
  'LA': ['Луизиана'],
  'ME': ['Мэн', 'Мейн'],
  'MD': ['Мэриленд', 'Мериленд'],
  'MA': ['Массачусетс'],
  'MI': ['Мичиган'],
  'MN': ['Миннесота'],
  'MS': ['Миссисипи'],
  'MO': ['Миссури'],
  'MT': ['Монтана'],
  'NE': ['Небраска'],
  'NV': ['Невада'],
  'NH': ['Нью-Гэмпшир', 'Нью-Хэмпшир'],
  'NJ': ['Нью-Джерси'],
  'NM': ['Нью-Мексико'],
  'NY': ['Нью-Йорк'],
  'NC': ['Северная Каролина'],
  'ND': ['Северная Дакота'],
  'OH': ['Огайо'],
  'OK': ['Оклахома'],
  'OR': ['Орегон'],
  'PA': ['Пенсильвания'],
  'RI': ['Род-Айленд'],
  'SC': ['Южная Каролина'],
  'SD': ['Южная Дакота'],
  'TN': ['Теннесси'],
  'TX': ['Техас'],
  'UT': ['Юта'],
  'VT': ['Вермонт'],
  'VA': ['Виргиния', 'Вирджиния'],
  'WA': ['Вашингтон'],
  'WV': ['Западная Виргиния', 'Западная Вирджиния'],
  'WI': ['Висконсин'],
  'WY': ['Вайоминг'],
  'PR': ['Пуэрто-Рико'],
  'GU': ['Гуам'],
  'VI': ['Виргинские острова'],
};

const List<UsState> kUsStates = [
  UsState('AL', 'Alabama'),
  UsState('AK', 'Alaska'),
  UsState('AZ', 'Arizona'),
  UsState('AR', 'Arkansas'),
  UsState('CA', 'California'),
  UsState('CO', 'Colorado'),
  UsState('CT', 'Connecticut'),
  UsState('DE', 'Delaware'),
  UsState('DC', 'District of Columbia'),
  UsState('FL', 'Florida'),
  UsState('GA', 'Georgia'),
  UsState('HI', 'Hawaii'),
  UsState('ID', 'Idaho'),
  UsState('IL', 'Illinois'),
  UsState('IN', 'Indiana'),
  UsState('IA', 'Iowa'),
  UsState('KS', 'Kansas'),
  UsState('KY', 'Kentucky'),
  UsState('LA', 'Louisiana'),
  UsState('ME', 'Maine'),
  UsState('MD', 'Maryland'),
  UsState('MA', 'Massachusetts'),
  UsState('MI', 'Michigan'),
  UsState('MN', 'Minnesota'),
  UsState('MS', 'Mississippi'),
  UsState('MO', 'Missouri'),
  UsState('MT', 'Montana'),
  UsState('NE', 'Nebraska'),
  UsState('NV', 'Nevada'),
  UsState('NH', 'New Hampshire'),
  UsState('NJ', 'New Jersey'),
  UsState('NM', 'New Mexico'),
  UsState('NY', 'New York'),
  UsState('NC', 'North Carolina'),
  UsState('ND', 'North Dakota'),
  UsState('OH', 'Ohio'),
  UsState('OK', 'Oklahoma'),
  UsState('OR', 'Oregon'),
  UsState('PA', 'Pennsylvania'),
  UsState('RI', 'Rhode Island'),
  UsState('SC', 'South Carolina'),
  UsState('SD', 'South Dakota'),
  UsState('TN', 'Tennessee'),
  UsState('TX', 'Texas'),
  UsState('UT', 'Utah'),
  UsState('VT', 'Vermont'),
  UsState('VA', 'Virginia'),
  UsState('WA', 'Washington'),
  UsState('WV', 'West Virginia'),
  UsState('WI', 'Wisconsin'),
  UsState('WY', 'Wyoming'),
];

UsState? usStateByCode(String? code) {
  if (code == null) return null;
  for (final s in kUsStates) {
    if (s.code == code) return s;
  }
  return null;
}
