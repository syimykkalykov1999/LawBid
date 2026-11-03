# 2026-11-02 — «Вылеты»: копирование, метка fatal, картинки, повтор загрузки экрана

- Админка: кнопка «Копировать» в окне вылета (сообщение, стек, последние случаи).
- Мобилка: PlatformDispatcher.onError больше не fatal (приложение продолжает работать); ошибки загрузки картинок («image resource service») не считаются вылетами; DeferredScreen молча повторяет загрузку чанка один раз.
- Не сделано: серверный thumbnailUrl (нет признака наличия превью в VideoAsset), классы 6+ (ждут скриншоты). Dart не компилировался в облаке — нужен compile-only на Mac.
- SHA слияния: (после слияния)
- Добавлено: `playSafely()` для fire-and-forget аудио (ошибка аудиосессии не вылет); фильтр WebSocketConnectionClosed из socket_io_client; подметены setState после await без mounted в 5 экранах (team_inbox_tab, active_devices, subscription, conversation _sendLocked, bid_detail). Остальные места эвристика (setState после await без mounted) не нашла.
