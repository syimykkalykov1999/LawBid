import { StaffWatermark } from '@/components/security/staff-watermark';
import { AppShell } from '@/components/shell/app-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <StaffWatermark />
    </>
  );
}
