'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { ChannelsPanel } from '@/components/media/channels-panel';
import { StickersPanel } from '@/components/media/stickers-panel';
import { VideosPanel } from '@/components/media/videos-panel';
import { Tabs } from '@/components/ui/tabs';

type Tab = 'videos' | 'stickers' | 'channels';

/** Reels (video assets) and sticker packs. */
export default function MediaPage() {
  const [tab, setTab] = useState<Tab>('videos');
  return (
    <>
      <PageHeader
        eyebrow="Модерация"
        title="Рилсы, стикеры и каналы"
        subtitle="Видео из рилсов, наборы стикеров и каналы адвокатов. Отсюда можно снять видео, скрыть набор или закрыть канал."
      />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'videos', label: 'Видео' },
            { value: 'stickers', label: 'Стикеры' },
            { value: 'channels', label: 'Каналы' },
          ]}
        />
      </div>
      {tab === 'videos' ? <VideosPanel /> : tab === 'stickers' ? <StickersPanel /> : <ChannelsPanel />}
    </>
  );
}
