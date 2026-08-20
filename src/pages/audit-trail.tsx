import { ClipboardList, FileText } from 'lucide-react';
import { useSession } from '@/features/auth/session-context';
import { AuditLogTab } from '@/features/audit/audit-log-tab';
import { ChangeHistoryTab } from '@/features/audit/change-history-tab';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function AuditTrailPage() {
  const { user } = useSession();
  const isPrivileged = ['IT Admin', 'Administrator'].includes(user?.role || '');

  return (
    <div className="mx-auto max-w-6xl">
      <Tabs defaultValue="audit">
        <TabsList className="mb-4">
          <TabsTrigger value="audit">
            <ClipboardList size={14} /> Audit Trail
          </TabsTrigger>
          {isPrivileged && (
            <TabsTrigger value="history">
              <FileText size={14} /> Change History
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="audit">
          <AuditLogTab />
        </TabsContent>
        {isPrivileged && (
          <TabsContent value="history">
            <ChangeHistoryTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
