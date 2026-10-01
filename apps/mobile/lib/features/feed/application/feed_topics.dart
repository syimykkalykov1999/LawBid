import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/persistence/persistence_providers.dart';

/// Owner 2026-09-30: every practice category can be a feed topic; each
/// user picks which ones their topic slider shows (filter button left of
/// "All"). A topic is the hashtag of its category.
const kPracticeCategoryCodes = <String>[
  'immigration',
  'family_law',
  'traffic_tickets',
  'criminal_defense',
  'dui_and_dwi',
  'personal_injury',
  'medical_malpractice',
  'workers_compensation',
  'estate_planning_and_probate',
  'elder_law',
  'real_estate',
  'landlord_and_tenant',
  'employment_and_labor',
  'bankruptcy_and_debt',
  'business_and_corporate',
  'intellectual_property',
  'tax_law',
  'civil_litigation',
  'consumer_protection',
  'insurance_law',
  'social_security_disability',
  'veterans_and_military',
  'civil_rights',
  'education_law',
  'health_care_law',
  'government_and_administrative_law',
  'appeals',
  'construction_law',
  'securities_and_financial_law',
  'environmental_and_energy_law',
  'technology_privacy_and_cyber_law',
  'entertainment_media_and_sports_law',
  'aviation_and_maritime_law',
  'international_and_cross_border_law',
  'antitrust_and_trade_regulation',
  'nonprofit_and_religious_organizations',
  'native_american_and_tribal_law',
  'animal_law',
  'cannabis_alcohol_and_firearms_law',
  'agriculture_and_gaming_law',
  'legal_malpractice',
  'general_practice',
];

/// English names (seed), used until the localized practice tree loads.
const kPracticeCategoryNamesEn = <String, String>{
  'criminal_defense': 'Criminal Defense',
  'dui_and_dwi': 'DUI and DWI',
  'traffic_tickets': 'Traffic Tickets',
  'personal_injury': 'Personal Injury',
  'medical_malpractice': 'Medical Malpractice',
  'workers_compensation': 'Workers Compensation',
  'family_law': 'Family Law',
  'immigration': 'Immigration',
  'estate_planning_and_probate': 'Estate Planning and Probate',
  'elder_law': 'Elder Law',
  'real_estate': 'Real Estate',
  'landlord_and_tenant': 'Landlord and Tenant',
  'employment_and_labor': 'Employment and Labor',
  'bankruptcy_and_debt': 'Bankruptcy and Debt',
  'business_and_corporate': 'Business and Corporate',
  'intellectual_property': 'Intellectual Property',
  'tax_law': 'Tax Law',
  'civil_litigation': 'Civil Litigation',
  'consumer_protection': 'Consumer Protection',
  'insurance_law': 'Insurance Law',
  'social_security_disability': 'Social Security Disability',
  'veterans_and_military': 'Veterans and Military',
  'civil_rights': 'Civil Rights',
  'education_law': 'Education Law',
  'health_care_law': 'Health Care Law',
  'government_and_administrative_law': 'Government and Administrative Law',
  'appeals': 'Appeals',
  'construction_law': 'Construction Law',
  'securities_and_financial_law': 'Securities and Financial Law',
  'environmental_and_energy_law': 'Environmental and Energy Law',
  'technology_privacy_and_cyber_law': 'Technology, Privacy and Cyber Law',
  'entertainment_media_and_sports_law': 'Entertainment, Media and Sports Law',
  'aviation_and_maritime_law': 'Aviation and Maritime Law',
  'international_and_cross_border_law': 'International and Cross-Border Law',
  'antitrust_and_trade_regulation': 'Antitrust and Trade Regulation',
  'nonprofit_and_religious_organizations':
      'Nonprofit and Religious Organizations',
  'native_american_and_tribal_law': 'Native American and Tribal Law',
  'animal_law': 'Animal Law',
  'cannabis_alcohol_and_firearms_law': 'Cannabis, Alcohol and Firearms Law',
  'agriculture_and_gaming_law': 'Agriculture and Gaming Law',
  'legal_malpractice': 'Legal Malpractice',
  'general_practice': 'General Practice',
};

/// The hashtags already in use for the first topics; the rest are the
/// category code without "_and_" and underscores (≤ 30 chars, a valid tag).
const _tagOverrides = <String, String>{
  'family_law': 'familylaw',
  'traffic_tickets': 'trafficticket',
  'criminal_defense': 'criminaldefense',
  'dui_and_dwi': 'dui',
  'personal_injury': 'personalinjury',
  'real_estate': 'realestate',
  'employment_and_labor': 'employment',
  'bankruptcy_and_debt': 'bankruptcy',
};

String topicTagFor(String categoryCode) {
  final o = _tagOverrides[categoryCode];
  if (o != null) return o;
  final tag = categoryCode.replaceAll('_and_', '_').replaceAll('_', '');
  return tag.length > 30 ? tag.substring(0, 30) : tag;
}

final Map<String, String> _categoryByTag = {
  for (final c in kPracticeCategoryCodes) topicTagFor(c): c,
};

/// Category of a generated topic hashtag (null for other tags).
String? categoryForTopicTag(String tag) => _categoryByTag[tag.toLowerCase()];

/// What the slider shows before the user picks anything. Owner
/// 2026-09-30: "News" first and on by default.
const kDefaultFeedTopicCategories = <String>[
  kNewsTopic,
  'immigration',
  'family_law',
  'traffic_tickets',
  'criminal_defense',
  'dui_and_dwi',
  'personal_injury',
  'real_estate',
  'employment_and_labor',
  'bankruptcy_and_debt',
];

const _prefsKey = 'feed.topics.v1';
const _newsKey = 'feed.topics.news.v1';

/// Owner 2026-09-30: the "News" topic in the slider (not a practice code).
const kNewsTopic = '@news';

final _codeShape = RegExp(r'^[a-z0-9_]+(\.[a-z0-9_]+)?$');

/// The categories in this user's topic slider, in catalog order; kept on
/// the device (a per-viewer convenience).
class FeedTopicsNotifier extends Notifier<List<String>> {
  @override
  List<String> build() {
    try {
      final saved =
          ref.read(sharedPreferencesProvider).getStringList(_prefsKey);
      if (saved != null) {
        // Owner 2026-09-30: any category or subcategory, in the order
        // picked.
        final list = [
          for (final c in saved)
            if (c == kNewsTopic || _codeShape.hasMatch(c)) c,
        ];
        // Owner 2026-09-30: News joined the picker checked by default —
        // add it once to a list saved before it existed.
        final prefs = ref.read(sharedPreferencesProvider);
        if (prefs.getBool(_newsKey) != true) {
          prefs.setBool(_newsKey, true);
          if (!list.contains(kNewsTopic)) list.insert(0, kNewsTopic);
          prefs.setStringList(_prefsKey, list);
        }
        return list;
      }
    } on Object {
      // Tests / previews without preferences: defaults.
    }
    return kDefaultFeedTopicCategories;
  }

  void set(Set<String> codes) {
    state = [
      for (final c in state)
        if (codes.contains(c)) c,
      for (final c in codes)
        if (!state.contains(c) && (c == kNewsTopic || _codeShape.hasMatch(c)))
          c,
    ];
    // News stays first when picked.
    if (state.remove(kNewsTopic)) state = [kNewsTopic, ...state];
    try {
      ref.read(sharedPreferencesProvider).setStringList(_prefsKey, state);
    } on Object {
      // Not persisted without preferences; the in-memory choice still works.
    }
  }
}

final feedTopicsProvider =
    NotifierProvider<FeedTopicsNotifier, List<String>>(FeedTopicsNotifier.new);
