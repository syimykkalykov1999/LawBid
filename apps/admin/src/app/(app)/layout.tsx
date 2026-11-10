import { StaffWatermark } from '@/components/security/staff-watermark';
import { AdminLive } from '@/components/shell/admin-live';
import { AppShell } from '@/components/shell/app-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <StaffWatermark />
      <AdminLive />
    </>
  );
}
