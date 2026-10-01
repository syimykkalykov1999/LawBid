
import '../../../shared/domain/user_role.dart';
import '../../design_system/widgets/bars/app_bottom_nav.dart';
import '../../l10n/translator.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Role affects bottom-nav CONTENT only, never route topology (file 01 §3):
/// both roles get the same 4 shell branches (Лента/Поиск/Моё/Профиль), just
/// with role-appropriate icons/labels where the spec implies a difference.
/// Stage 1.5 renders identical config for both roles — the spec doesn't
/// actually call for different tab icons/labels per role in §3, only
/// different CONTENT INSIDE each screen (e.g. Attorney's Feed adds a
/// "Кейсы" sub-tab) — that's each screen's own concern in later stages, not
/// this function's. Kept role-parameterized now so a real future difference
/// doesn't require touching the router (docs/CHANGELOG.md stage 1.5).
List<AppTabConfig> tabsForRole(UserRole? role, Translator t) {
  return [
    AppTabConfig(
      key: AppTabKey.feed,
      icon: AppIcons.articleOutlined,
      activeIcon: AppIcons.article,
      label: t.t('nav.tab.feed'),
    ),
    AppTabConfig(
      key: AppTabKey.search,
      icon: AppIcons.searchOutlined,
      activeIcon: AppIcons.search,
      label: t.t('nav.tab.search'),
    ),
    AppTabConfig(
      key: AppTabKey.mine,
      icon: AppIcons.folderOutlined,
      activeIcon: AppIcons.folder,
      label: t.t('nav.tab.mine'),
    ),
    AppTabConfig(
      key: AppTabKey.profile,
      icon: AppIcons.personOutline,
      activeIcon: AppIcons.person,
      label: t.t('nav.tab.profile'),
    ),
  ];
}
