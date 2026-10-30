import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Phone, Search, UserRound, UsersRound } from 'lucide-react';
import { Link, useParams } from 'wouter';
import { getGetOwnerQueryKey, useGetOwner, useListOwners } from '@workspace/api-client-react';
import { DetailItem, EmptyState, LoadingRows, PageHeading, QueryError, SpeciesIcon, errorText } from '@/components/clinic-ui';
import { OwnerLinks } from '@/components/owner-links';

export function OwnersPage() {
  const [searchText, setSearchText] = useState('');
  const params = useMemo(() => searchText.trim() ? { q: searchText.trim() } : undefined, [searchText]);
  const owners = useListOwners(params);
  const ownerList = owners.data ?? [];
  return (
    <div className="content-wrap">
      <PageHeading eyebrow="Directorio" title="Responsables" subtitle="Las personas que cuidan de cada mascota. Una mascota puede tener varios responsables y un responsable varias mascotas." />
      <div className="toolbar"><div className="search-wrap"><Search size={17} /><input className="field-input" type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Buscar por nombre o teléfono…" aria-label="Buscar responsables" data-testid="input-search-owners" /></div><span className="muted" style={{ fontSize: 12 }}>{owners.data ? `${ownerList.length} ${ownerList.length === 1 ? 'responsable' : 'responsables'}` : ''}</span></div>
      {owners.isError ? <div className="panel"><QueryError message={errorText(owners.error)} retry={() => void owners.refetch()} /></div> :
        owners.isLoading ? <div className="panel"><LoadingRows /></div> :
          ownerList.length === 0 ? <div className="panel"><EmptyState icon={<UsersRound size={20} />} title={searchText ? 'No encontramos coincidencias' : 'Aún no hay responsables'} copy={searchText ? 'Prueba con otro nombre o teléfono.' : 'Los responsables se crean al registrar una mascota.'} /></div> :
            <div className="panel table-panel"><table className="data-table"><thead><tr><th>Responsable</th><th>Contacto</th><th>Mascotas</th><th></th></tr></thead><tbody>{ownerList.map((owner) => <tr key={owner.id} data-testid={`row-owner-${owner.id}`}><td><Link href={`/owners/${owner.id}`} style={{ color: 'inherit', textDecoration: 'none' }}><div className="pet-cell"><div className="pet-avatar"><UserRound size={17} strokeWidth={1.8} /></div><div><span className="pet-name">{owner.name}</span></div></div></Link></td><td><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Phone size={13} />{owner.phone}</span></td><td><span className="tag">{owner.patientCount} {owner.patientCount === 1 ? 'mascota' : 'mascotas'}</span> <span className="pet-meta" style={{ display: 'inline', marginLeft: 6 }}>{owner.patientNames.join(', ')}</span></td><td><div className="table-actions"><Link className="icon-btn" href={`/owners/${owner.id}`} aria-label={`Ver mascotas de ${owner.name}`} data-testid={`button-view-owner-${owner.id}`}><ArrowRight size={15} /></Link></div></td></tr>)}</tbody></table></div>}
    </div>
  );
}

export function OwnerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const validId = Number.isInteger(id) && id > 0;
  const ownerQuery = useGetOwner(validId ? id : 0, { query: { enabled: validId, queryKey: getGetOwnerQueryKey(validId ? id : 0) } });
  const owner = ownerQuery.data;
  if (!validId) return <div className="content-wrap"><QueryError message="El identificador del responsable no es válido." retry={() => window.history.back()} /></div>;
  if (ownerQuery.isLoading) return <div className="content-wrap"><div className="skeleton" style={{ height: 125, borderRadius: 18, marginBottom: 18 }} /><div className="panel"><LoadingRows /></div></div>;
  if (ownerQuery.isError || !owner) return <div className="content-wrap"><QueryError message={ownerQuery.error ? errorText(ownerQuery.error) : 'No encontramos este responsable.'} retry={() => void ownerQuery.refetch()} /></div>;
  return (
    <div className="content-wrap">
      <PageHeading eyebrow="Ficha del responsable" title="Responsable" subtitle="Datos de contacto y todas las mascotas a su cargo." />
      <Link href="/owners" className="text-link" style={{ marginBottom: 16 }} data-testid="link-back-owners"><ArrowLeft size={14} />Volver a responsables</Link>
      <section className="patient-hero"><div className="pet-avatar"><UserRound size={25} strokeWidth={1.8} /></div><div><h2>{owner.name}</h2><p>{owner.phone}</p></div></section>
      <section className="detail-grid">
        <div className="panel"><div className="panel-heading"><div><h2 className="panel-title">Datos del responsable</h2><p className="panel-caption">Información de contacto</p></div><UserRound size={17} className="muted" /></div><div className="detail-list"><DetailItem label="Nombre" value={owner.name} /><DetailItem label="Teléfono" value={owner.phone} /><DetailItem label="Mascotas a cargo" value={String(owner.patients.length)} /></div></div>
        <div className="panel"><div className="panel-heading"><div><h2 className="panel-title">Mascotas de {owner.name}</h2><p className="panel-caption">Todas las mascotas de las que es responsable</p></div><span className="tag" data-testid="owner-pets-count">{owner.patients.length} {owner.patients.length === 1 ? 'mascota' : 'mascotas'}</span></div>
          <div className="visit-list">{owner.patients.map((patient) => {
            const coOwners = patient.owners.filter((other) => other.id !== owner.id);
            return <div className="visit-row" key={patient.id} data-testid={`owner-pet-${patient.id}`}>
              <div className="pet-avatar"><SpeciesIcon species={patient.species} /></div>
              <div className="visit-row-content"><strong>{patient.name}</strong><span>{patient.species}{patient.breed ? ` · ${patient.breed}` : ''} · {patient.age} {patient.age === 1 ? 'año' : 'años'}</span>{coOwners.length > 0 && <div className="co-owners"><small>También a cargo de</small><OwnerLinks owners={coOwners} testIdPrefix={`link-coowner-${patient.id}`} /></div>}</div>
              <Link className="icon-btn" href={`/patients/${patient.id}`} aria-label={`Abrir ficha de ${patient.name}`} data-testid={`link-owner-pet-${patient.id}`}><ArrowRight size={17} /></Link>
            </div>;
          })}</div>
        </div>
      </section>
    </div>
  );
}
