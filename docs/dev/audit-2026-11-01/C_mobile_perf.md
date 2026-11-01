# Mobile perf audit (apps/mobile/lib) — read-only, 2026-11-01

Общая картина: код уже сильно оптимизирован (builder-списки, findChildIndexCallback, RepaintBoundary вокруг чата,
HLS-prefetch рилсов, memCacheWidth почти везде, drift-кэш чата/списков, retry с backoff+jitter+Retry-After,
off-main JSON >порога, upload-очередь с resume, сжатие фото через image_picker maxPx/quality, video_compress,
reduce-motion, startup с таймаутами 3 с и unawaited-прогревом). Утечек контроллеров/таймеров не найдено
(эвристический скан: все TextEditingController/AnimationController/Timer.periodic парно dispose/cancel;
диалоговый controller в owner_case_screen:103 снимается отложенно, ок). Ниже только НОВОЕ.
Не сверял построчно с docs/perf и docs/dev/APP_* — только выборочно по коду.

## P1

C-1 P1 — профиль: сетка постов грузит следующую страницу ТОЛЬКО по тапу на кнопку
  Файл: features/social/presentation/screens/social_screens.dart:1075-1079 (gridWithMore -> TextButton onPressed loadMore),
  вызывается из profile/presentation/widgets/attorney_profile_view.dart:282-296 и client_social_profile.dart:328-339
  (asSliver: true). Авто-подгрузки (NotificationListener/extentAfter) нет ни в одном из двух view.
  Симптом: >1 страницы постов (обычно 12-30) — скролл упирается в «Загрузка…» (текст кнопки, а не спиннер), надо тапать.
  Instagram/TikTok профиль — бесконечный. Видно уже на 30+ постах/рилсах.
  Фикс: в asSliver-ветке вместо TextButton вернуть sliver-футер, который в build ставит addPostFrameCallback(loadMore)
  (как в social_screens.dart:390-393 для SliverList), либо SliverGrid с childCount=count и триггером на последних
  ~2 рядах (itemBuilder: if (i >= count-6 && page.canLoadMore) postFrame(loadMore)). Кнопку оставить только для error/retry.

C-2 P1 — чат: подгрузка старых сообщений стартует только когда построен «хвостовой» элемент списка
  Файл: features/chat/presentation/conversation_screen.dart:1042-1075 (ListView.builder reverse, у последнего
  itemCount+1 — addPostFrameCallback(onMore)); chat_list_controller.dart:96-99 (pixels >= maxScrollExtent-1).
  cacheExtent по умолчанию (~250 px) => запрос уходит когда юзер уже у верха. Симптом: на 3G/слабом LTE при
  скролле вверх по истории (>1 страницы, ~30-50 сообщений) виден спиннер/упор; Telegram/WhatsApp подгружают за 1-2 экрана.
  Фикс: триггер по порогу — в itemBuilder `if (i >= entries.length - 8 && state.nextCursor != null && !state.loadingMore)
  postFrame(onMore)` (или NotificationListener extentAfter < 1.5*viewport); плюс cacheExtent ≈ 1 viewport
  (ScrollCacheExtent.viewport(1), как уже сделано в async_views.dart:~170 для ленты).

C-3 P1 — истории: нет предзагрузки следующей истории/следующего автора
  Файлы: features/stories/presentation/story_viewer_screen.dart (нет precacheImage/HlsPrefetcher; grep по features/stories
  даёт precacheImage только в story_creator_screen.dart:573), story_video.dart:50-80 (VideoPlayerController создаётся
  только при показе, initialize() ждёт сеть, нет постера/блюра пока !_ready).
  Симптом: каждый тап «вперёд» = пустой кадр/спиннер на время загрузки фото 1080 px (300-1500 мс на 4G) и ≥0.5-2 с
  для видео. Instagram/WhatsApp Status грузят next заранее.
  Фикс: в _PlaybackController при смене index вызывать precacheImage(appNetworkImage(next.photoUrl,1080), context)
  для index+1 (и первой истории следующего автора), для видео — HlsPrefetcher.instance.prefetch(url) (как в
  reels_screen.dart:107); в StoryVideoPlayer показывать thumb пока !_ready.

C-4 P1 — каналы/группы: список строится не лениво (ListView(children:[for ...]))
  Файл: features/channels/presentation/channels_screen.dart:485-520 (list(...) с rows: List<Widget>, + onNotification more),
  channels/presentation/sections_archive.dart:217-235 (архив: for (final c in channels) ChannelRow).
  Симптом: все загруженные строки (вкладки Группы/Каналы/Рекомендации; пагинация копит страницы) создаются сразу:
  при ~300+ строках — заметный джанк на открытии/refresh и лишняя память (каждая строка — аватар+бейджи).
  Фикс: ListView.builder (itemCount = header.length + rows.length, itemBuilder по индексу; rows сделать List<Widget Function()>
  или строить ChannelRow в builder), itemExtent/prototypeItem если высота строки фикс.

## P2

C-5 P2 — превью ссылки в чате: полноразмерное декодирование OG-картинки
  Файл: features/chat/presentation/link_preview_card.dart:61-68 — CachedNetworkImage без memCacheWidth/Height и без
  placeholder (AspectRatio 1.91 держит место, но кадр пустой до загрузки). OG-картинки бывают 1200x630..4000 px:
  ~10-60 МБ декода на карточку, в ленте чата с 10 превью — давление на ImageCache и jank на декоде.
  Фикс: memCacheWidth: decodeWidthFor(MediaQuery.sizeOf(context).width) (хелпер уже есть в core/media/image_size.dart),
  placeholder: ColoredBox(skeletonBase).

C-6 P2 — аватар канала в форме: Image.memory без cacheWidth
  Файл: features/channels/presentation/channel_form_screen.dart:322-326 (64x64, _avatarBytes — оригинал пикера, может быть
  12 Мп). Фикс: cacheWidth: 192 (как в create_post_screen.dart:1154). Проверить, что при выборе передаётся maxWidth в
  channel_pickers.dart:97 (pickImage) — иначе на загрузку уйдёт оригинал без ресайза.

C-7 P2 — каналы: оптимистичный toggleReaction откатывается к устаревшему снапшоту при быстрых тапах
  Файл: features/channels/application/channels_providers.dart:434-445 (on error patch(post.id,(_)=>post) — `post` захвачен
  до тапа; два тапа подряд -> ошибка первого сотрёт результат второго; успешный ответ первого тоже перетрёт локальное
  состояние второго `saved`). Аналогично setSubscribed:228-247 / setMuted. Симптом: мигание счётчика реакции при
  двойном тапе/нестабильной сети. Фикс: сериализовать на пост (Map<postId,Future> chain) или игнорировать ответ, если
  p.myReaction уже изменился после тапа; откат — только если текущее состояние == оптимистичное.

C-8 P2 — канал: удаление поста ждёт сервер (не оптимистично)
  Файл: channels/application/channels_providers.dart:454-462 (remove: await _repo.removePost -> только потом убрать из state;
  затем ref.invalidate(channelProvider) -> лишний рефетч канала). Edit тоже ждёт (448-452). Telegram убирает сообщение
  сразу + Undo. Фикс: убрать из state сразу, на ошибку вернуть (как toggleReaction); invalidate заменить на patch счётчика.

C-9 P2 — групповой звонок: getStats() по всем линкам каждые 500 мс
  Файл: features/calls/application/call_media.dart:410-432 (_pollLevels: for link in _links: await link.pc.getStats(),
  разбор всего отчёта); дубль в cloudflare_sfu_call_media.dart:440. При 6-8 участниках — 12-16 getStats/с на main isolate
  (каждый отчёт сотни записей) -> тепло/батарея, джанк UI звонка. Фикс: период 1000-1500 мс для >4 линков, брать
  только inbound-rtp audio через pc.getReceivers()+track-stats либо на сервере (SFU) отдавать active speaker.

C-10 P2 — feed_screen build читает MediaQuery.of(context) целиком
  Файл: features/feed/presentation/screens/feed_screen.dart:445 (`final media = MediaQuery.of(context)` в build вкладки
  ленты; используется media.padding.top). Любое изменение MediaQuery (клавиатура на другом маршруте/поворот/textScale)
  перестраивает всю шапку+фильтры вкладки. Фикс: MediaQuery.paddingOf(context).top (аналогично
  core/navigation/shell/main_shell.dart:267 — там тоже MediaQuery.of; заменить на paddingOf/viewPaddingOf
  + MediaQuery.copyWith нужен полностью — оставить, но обернуть в Builder над меньшим поддеревом).
  Остальные 17 MediaQuery.of в core — по большей части разовые, приоритет низкий.

C-11 P2 — разбор RegExp в build карточек
  Файл: features/social/presentation/widgets/post_card.dart:106 (RegExp(r'\s+') создаётся на каждый build строки),
  :2197 (replaceFirst(RegExp(r'\.+$')) на каждый токен в PostBodyText), :669 (RegExp внутри метода).
  На ленте из 50 карточек — тысячи компиляций при скролле/ребилдах. Фикс: static final RegExp
  (как уже сделано для _token:2134 и _trailingTags:657).

C-12 P2 — реестр постов профиля/ленты: dedupe и фильтры O(n) на каждый setState
  Файл: features/reels/presentation/reels_screen.dart:132,161,196 (`_items.map(p=>p.id).toSet()` на каждую страницу и
  _mixFresh/refresh), :~240 build фильтрует `_items` через deleted/filter при каждом setState (в т.ч. _loading
  toggling дважды на страницу). При ≤500 элементов — не заметно; при долгих сессиях рилсов (1000+) — лишние аллокации
  в build PageView. Фикс: держать Set<String> _seenIds рядом с _items; не вызывать setState(_loading) если
  _more уже false/последний запрос ещё идёт (guard уже есть) — объединить с addAll в один setState.

C-13 P2 — рилс: ранний рефетч первой страницы на каждую подгрузку
  Файл: reels_screen.dart:165 (`unawaited(_mixFresh())` в начале КАЖДОГО _load; гейт 3 мин — ок, но при входе во вкладку
  _load() initState + _mixFresh сразу => 2 одинаковых запроса /reels (cursor=null) на открытие экрана:
  initState -> _load() -> _mixFresh() с _freshAt=DateTime.now() выставленным в поле, т.е. гейт ПРОХОДИТ только после 3 мин —
  дубля нет, но _freshAt инициализируется «сейчас» => первые 3 мин свежие не подмешиваются; ок). Не баг; оставлено
  как проверка: дублей запросов при открытии НЕ найдено.

## Подтверждено ОК (не трогать)
- Стартап (core/config/run_app.dart): блокирующие await до runApp только локальные (prefs, AppVersion/DeviceKey с
  таймаутом 3 с, l10n bootstrap — local-only, 3 с), всё сетевое unawaited. Худший случай ~6 с чёрного кадра на
  зависшем платформенном вызове — маловероятно, но можно сжать общий бюджет до одного Future.timeout(3s) на все шаги.
- Рилсы: 1 VideoPlayerController на страницу, close() глушит звук и dispose, allowImplicitScrolling греет соседей,
  HlsPrefetcher на +3, порог подгрузки i >= len-3, постер precacheImage — соответствует TikTok-классу.
- Лента: PagedListBody -> AppPaginatedListView, порог 2 экрана, scrollCacheExtent viewport(1), skeleton, 5 состояний.
- Картинки: appNetworkImage/StableNetworkImage со стабильным ключом, два дисковых кэша с лимитами, memCacheWidth везде
  кроме C-5/C-6; blur-up через ProgressivePhoto.
- JSON: Dio default BackgroundTransformer + decodeJsonOffMain/Rows для кэша; main-isolate jsonDecode остался только на
  малых локальных payload (prefs, push payload).
- Оптимистичные: лайки/подписки/реакции/опросы/нотификации; отправка в чате через outbox/message_store (drift).
- Таймеры звонка изолированы в _CallClock (setState только на часы).
