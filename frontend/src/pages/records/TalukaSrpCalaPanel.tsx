/**
 * Read-only SRP / CALA display for a Land Acquisition record.
 *
 * Replaces the RJSF form for the record's "srp" and "cala" sections (see
 * RecordEditPage's centreContent). SRP and CALA gazette details are entered
 * once per Sub Division/Taluka (see TalukaDetailsPanel in ProjectWorkspace),
 * not per record — this panel just fetches and displays whichever taluka the
 * record's Acquisition Details section currently names.
 */

import { useQuery } from '@tanstack/react-query';
import { Alert, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import { fetchTalukas } from '@api/talukaDetails';
import { AttachmentPanel, ACCEPT_DOCUMENTS } from '@components/attachments/AttachmentPanel';

const { Text } = Typography;

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 4 }}>
      <Text type="secondary" style={{ minWidth: 180 }}>{label}</Text>
      <Text>{value || '—'}</Text>
    </div>
  );
}

export function TalukaSrpCalaPanel({
  activityId,
  talukaName,
  section,
}: {
  activityId: string;
  /** The record's acquisition_details.sub_division_taluka value, if set. */
  talukaName: string | undefined;
  section: 'srp' | 'cala';
}) {
  const { data: talukas, isLoading } = useQuery({
    queryKey: ['talukas', activityId],
    queryFn: () => fetchTalukas(activityId),
    enabled: !!activityId,
  });

  if (isLoading) return <Spin style={{ display: 'block', margin: '32px auto' }} />;

  if (!talukaName) {
    return (
      <Alert
        type="info"
        showIcon
        message="No Sub Division/Taluka selected"
        description="Pick a Sub Division/Taluka in the Acquisition Details section first — SRP and CALA are fetched from there, not entered per record."
      />
    );
  }

  const taluka = talukas?.find((t) => t.talukaName.toLowerCase() === talukaName.toLowerCase());

  if (!taluka) {
    return (
      <Alert
        type="warning"
        showIcon
        message={`No taluka master entry for "${talukaName}"`}
        description="Add it in the activity's Sub division/taluka panel to fill in SRP and CALA details."
      />
    );
  }

  const isSrp = section === 'srp';

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 14 }}
        message={`Read-only — fetched from Sub division/taluka: ${taluka.talukaName}`}
        description="To correct these values, edit them once in the activity's Sub division/taluka panel — every record under this taluka updates together."
      />
      {isSrp ? (
        <>
          <Row label="SRP declared in gazette on" value={taluka.srpDeclaredInGazOn ? dayjs(taluka.srpDeclaredInGazOn).format('DD MMM YYYY') : null} />
          <Row label="Gazette published on" value={taluka.srpGazettePublishedOn ? dayjs(taluka.srpGazettePublishedOn).format('DD MMM YYYY') : null} />
          <Row label="Gazette number" value={taluka.srpGazetteNumber} />
          <div style={{ marginTop: 10 }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Gazette PDF</Text>
            <AttachmentPanel entityType="ACTIVITY_TALUKA__srp_gazette" entityId={taluka.id} accept={ACCEPT_DOCUMENTS} canDelete={false} />
          </div>
        </>
      ) : (
        <>
          <Row label="CALA received from state on" value={taluka.calaReceivedFromStateOn ? dayjs(taluka.calaReceivedFromStateOn).format('DD MMM YYYY') : null} />
          <Row label="Gazette published on" value={taluka.calaGazettePublishedOn ? dayjs(taluka.calaGazettePublishedOn).format('DD MMM YYYY') : null} />
          <Row label="Gazette number" value={taluka.calaGazetteNumber} />
          <div style={{ marginTop: 10 }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Gazette PDF</Text>
            <AttachmentPanel entityType="ACTIVITY_TALUKA__cala_gazette" entityId={taluka.id} accept={ACCEPT_DOCUMENTS} canDelete={false} />
          </div>
        </>
      )}
    </div>
  );
}
