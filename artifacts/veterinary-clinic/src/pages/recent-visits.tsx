import { useState } from 'react';
import { CalendarClock, Download } from 'lucide-react';
import { Link } from 'wouter';
import { exportVisitsCsv, useListVisits } from '@workspace/api-client-react';
import { Button, EmptyState, LoadingRows, PageHeading, QueryError, SpeciesIcon, errorText, formatDate } from '@/components/clinic-ui';

const RECENT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function downloadFile(file: Blob, fileName: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function RecentVisitsPage() {
  const visits = useListVisits({ days: RECENT_DAYS });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const visitList = visits.data ?? [];

  const today = new Date();
  const since = new Date(today.getTime() - (RECENT_DAYS - 1) * DAY_MS);

  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      // The blob keeps the UTF-8 BOM, so spreadsheets read the accents correctly.
      const file = (await exportVisitsCsv({ days: RECENT_DAYS }, { responseType: 'blob' })) as unknown as Blob;
      downloadFile(file, `visitas-ultimos-${RECENT_DAYS}-dias.csv`);
    } catch (error) {
      setExportError(errorText(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="content-wrap">
      <PageHeading eyebrow="Atención médica" title={`Últimos ${RECENT_DAYS} días`} subtitle={`Visitas del ${formatDate(since.toISOString(), { day: 'numeric', month: 'long' })} al ${formatDate(today.toISOString(), { day: 'numeric', month: 'long' })}. Las anteriores no aparecen aquí.`}>
        <Button type="button" className="btn-primary" disabled={exporting || visits.isLoading || visits.isError} onClick={() => void exportCsv()} data-testid="button-export-csv"><Download size={16} />{exporting ? 'Exportando…' : 'Exportar CSV'}</Button>
      </PageHeading>
      {exportError && <div className="api-error" role="alert" data-testid="export-error">No se pudo exportar el CSV: {exportError}</div>}
      <div className="toolbar"><span className="muted" style={{ fontSize: 12 }} data-testid="recent-visits-count">{visits.data ? `${visitList.length} ${visitList.length === 1 ? 'consulta' : 'consultas'} en los últimos ${RECENT_DAYS} días` : ''}</span></div>
      {visits.isError ? <div className="panel"><QueryError message={errorText(visits.error)} retry={() => void visits.refetch()} /></div> :
        visits.isLoading ? <div className="panel"><LoadingRows /></div> :
          visitList.length === 0 ? <div className="panel"><EmptyState icon={<CalendarClock size={20} />} title={`No hay consultas en los últimos ${RECENT_DAYS} días`} copy="Cuando registres una consulta reciente aparecerá aquí." /></div> :
            <div className="panel table-panel"><table className="data-table" data-testid="recent-visits-table"><thead><tr><th>Fecha</th><th>Mascota</th><th>Responsable</th><th>Motivo</th></tr></thead><tbody>{visitList.map((visit) => <tr key={visit.id} data-testid={`row-recent-visit-${visit.id}`}><td><span style={{ color: '#4b705b', fontWeight: 600 }}>{formatDate(visit.visitDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span><span className="pet-meta">{formatDate(visit.visitDate, { hour: '2-digit', minute: '2-digit' })}</span></td><td><Link href={`/patients/${visit.patientId}`} className="text-link" data-testid={`link-recent-visit-patient-${visit.id}`}><div className="pet-avatar" style={{ width: 30, height: 30, borderRadius: 10 }}><SpeciesIcon species={visit.patientSpecies} size={14} /></div>{visit.patientName}</Link></td><td>{visit.ownerNames}</td><td>{visit.reason}</td></tr>)}</tbody></table></div>}
    </div>
  );
}
