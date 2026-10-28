import 'package:lawbid/core/text/search_fold.dart';

/// Owner 2026-10-28: one local matcher for every practice-area search — the
/// case wizard («О чём ваш кейс?»), the attorney's practice pickers and the
/// case / topic filters. No server call: the practice tree is already on
/// the device; this only reads it.
///
/// A practice matches by its name in the app's language, its English name
/// or an everyday word for it ([kPracticeSynonyms], RU + EN: «развод»,
/// «ДТП», «грин-карта», «пьяный за рулём»), best first:
///  0 the whole name, 1 the name starts with the text, 2 every typed word
///  starts a word of the name (any order), 3 the text sits inside the name
///  (3+ letters), 4 one typo per word (4+ letters).
/// An everyday word ranks just after the same match on the real name. A
/// category's hit lists its sub-areas under it (the callers expand it).
class PracticeEntry {
  const PracticeEntry({
    required this.code,
    required this.localName,
    required this.englishName,
  });

  /// `family_law` (a category) or `family_law.divorce` (a sub-area).
  final String code;
  final String localName;
  final String englishName;
}

/// Everyday words → the practice they mean (category or sub-area code).
/// Lower case; ё is folded to е when matched.
const kPracticeSynonyms = <String, List<String>>{
  'family_law': ['семья', 'семейное', 'брак', 'family', 'marriage'],
  'family_law.divorce': [
    'развод',
    'развестись',
    'разводиться',
    'расторжение брака',
    'divorce',
    'split up',
  ],
  'family_law.child_custody': [
    'опека над ребенком',
    'с кем останется ребенок',
    'дети после развода',
    'custody',
  ],
  'family_law.child_support': [
    'алименты на ребенка',
    'алименты',
    'child support',
  ],
  'family_law.alimony_and_spousal_support': ['алименты супруге', 'alimony'],
  'family_law.adoption': ['усыновление', 'удочерение', 'adoption'],
  'personal_injury': ['травма', 'вред здоровью', 'injury', 'injured'],
  'personal_injury.car_accident': [
    'дтп',
    'авария',
    'автоавария',
    'разбил машину',
    'car crash',
    'car accident',
    'accident',
    'crash',
  ],
  'personal_injury.slip_and_fall': ['поскользнулся', 'упал', 'slipped'],
  'personal_injury.dog_bite': ['укус собаки', 'собака укусила', 'dog bit'],
  'personal_injury.wrongful_death': ['гибель', 'смерть по вине'],
  'medical_malpractice': [
    'врачебная ошибка',
    'ошибка врача',
    'врач',
    'больница',
    'doctor mistake',
  ],
  'workers_compensation.workplace_injury': [
    'травма на работе',
    'производственная травма',
    'hurt at work',
    'work injury',
  ],
  'immigration': [
    'иммиграция',
    'виза',
    'визы',
    'эмиграция',
    'immigration',
    'visa',
    'uscis',
  ],
  'immigration.deportation_and_removal_defense': [
    'депортация',
    'депортируют',
    'высылка',
    'deportation',
    'deported',
  ],
  'immigration.green_card': [
    'грин-карта',
    'грин карта',
    'гринкарта',
    'вид на жительство',
    'green card',
    'greencard',
  ],
  'immigration.citizenship_and_naturalization': [
    'гражданство',
    'натурализация',
    'citizenship',
  ],
  'immigration.asylum_and_refugee': ['убежище', 'беженец', 'asylum', 'refugee'],
  'immigration.student_visas': ['студенческая виза', 'f1', 'student visa'],
  'dui_and_dwi': [
    'пьяный за рулем',
    'пьяная езда',
    'вождение в нетрезвом виде',
    'нетрезвый за рулем',
    'алкоголь за рулем',
    'drunk driving',
    'drunk driver',
    'dui',
    'dwi',
    'owi',
  ],
  'traffic_tickets': [
    'штраф',
    'гаи',
    'гибдд',
    'превышение скорости',
    'лишили прав',
    'ticket',
    'speeding',
  ],
  'criminal_defense': [
    'уголовное дело',
    'арест',
    'арестовали',
    'задержали',
    'обвинение',
    'criminal',
    'arrested',
    'charged',
  ],
  'criminal_defense.theft_and_burglary': ['кража', 'воровство', 'theft'],
  'criminal_defense.drug_offenses': ['наркотики', 'drugs'],
  'criminal_defense.assault_and_battery': ['драка', 'избиение', 'fight'],
  'criminal_defense.fraud_and_embezzlement': ['растрата'],
  'landlord_and_tenant': ['аренда', 'арендодатель', 'съемная квартира', 'rent'],
  'landlord_and_tenant.eviction_defense': [
    'выселение',
    'выселяют',
    'eviction',
    'evicted',
  ],
  'landlord_and_tenant.security_deposit_disputes': [
    'залог за квартиру',
    'депозит за квартиру',
    'deposit',
  ],
  'employment_and_labor': ['работа', 'работодатель', 'job', 'employer'],
  'employment_and_labor.wrongful_termination': [
    'уволили',
    'увольнение',
    'fired',
    'laid off',
  ],
  'employment_and_labor.wage_and_hour': [
    'зарплата',
    'не платят зарплату',
    'переработка',
    'unpaid wages',
    'overtime',
  ],
  'employment_and_labor.sexual_harassment': ['домогательства', 'harassment'],
  'employment_and_labor.workplace_discrimination': ['дискриминация на работе'],
  'bankruptcy_and_debt': [
    'банкротство',
    'долги',
    'долг',
    'коллекторы',
    'кредит',
    'debt',
    'bankrupt',
  ],
  'estate_planning_and_probate': ['наследство', 'inheritance', 'estate'],
  'estate_planning_and_probate.wills': ['завещание', 'will'],
  'estate_planning_and_probate.trusts': ['траст', 'trust'],
  'real_estate': [
    'недвижимость',
    'покупка дома',
    'продажа дома',
    'квартира',
    'house',
    'property',
  ],
  'real_estate.foreclosure_defense': ['ипотека отбирают', 'foreclosure'],
  'business_and_corporate': ['бизнес', 'компания', 'business', 'company'],
  'business_and_corporate.business_formation': [
    'открыть бизнес',
    'открыть компанию',
    'регистрация ооо',
    'llc',
    'start a business',
  ],
  'business_and_corporate.contracts': ['договор', 'контракт', 'contract'],
  'tax_law': ['налоги', 'налоговая', 'налог', 'irs', 'taxes'],
  'intellectual_property.trademarks': ['товарный знак', 'бренд', 'trademark'],
  'intellectual_property.copyright': ['авторское право', 'copyright'],
  'intellectual_property.patents': ['патент', 'patent'],
  'consumer_protection': [
    'мошенничество',
    'обманули',
    'обман',
    'мошенники',
    'scam',
    'scammed',
  ],
  'insurance_law': ['страховка', 'страховая', 'страхование', 'insurance'],
  'social_security_disability': ['инвалидность', 'пособие по инвалидности'],
  'civil_rights.police_misconduct': [
    'превышение полномочий полиции',
    'полиция избила',
    'police brutality',
  ],
  'education_law': ['школа', 'университет', 'school', 'college'],
  'general_practice.not_sure_or_other': ['не знаю', 'другое', 'not sure'],
};

/// Fold for practice names: [searchFold] plus punctuation as spaces
/// («Family-Based» = "family based", «грин-карта» = «грин карта»).
String _fold(String s) => searchFold(s)
    .replaceAll(RegExp(r'[^\p{L}\p{N}]+', unicode: true), ' ')
    .trim();

/// The best tier of [text] against [query] (both folded), or null.
int? _tierIn(String query, List<String> words, String text) {
  if (text.isEmpty) return null;
  if (text == query) return 0;
  if (text.startsWith(query)) return 1;
  final hay = text.split(' ');
  bool startsAWord(String w) => hay.any((h) => h.startsWith(w));
  if (words.every(startsAWord)) return 2;
  if (query.replaceAll(' ', '').length >= 3 && text.contains(query)) {
    return 3;
  }
  if (words.every(
    (w) =>
        startsAWord(w) ||
        (w.length >= 4 &&
            hay.any((h) {
              final head = h.length > w.length ? h.substring(0, w.length) : h;
              return withinOneEdit(w, head) || withinOneEdit(w, h);
            })),
  )) {
    return 4;
  }
  return null;
}

/// Practices matching [query], best first: code → the word that matched
/// when it is not the name in the app's language (the English name or an
/// everyday word; null otherwise). Fewer than 2 letters → nothing.
Map<String, String?> rankPractices(
  String query,
  List<PracticeEntry> entries, {
  Map<String, List<String>> synonyms = kPracticeSynonyms,
}) {
  final q = _fold(query);
  if (q.replaceAll(' ', '').length < 2) return const {};
  final words = q.split(' ');
  final scored = <(int, int, String, String?)>[];
  for (final (i, e) in entries.indexed) {
    int? best;
    String? via;
    void consider(String text, int bonus, String? label) {
      final t = _tierIn(q, words, _fold(text));
      if (t == null) return;
      final score = t * 3 + bonus;
      if (best == null || score < best!) {
        best = score;
        via = label;
      }
    }

    consider(e.localName, 0, null);
    if (e.englishName != e.localName) consider(e.englishName, 0, e.englishName);
    for (final s in synonyms[e.code] ?? const <String>[]) {
      consider(s, 1, s);
    }
    if (best != null) scored.add((best!, i, e.code, via));
  }
  scored.sort((a, b) => a.$1 != b.$1 ? a.$1 - b.$1 : a.$2 - b.$2);
  return {for (final s in scored) s.$3: s.$4};
}
