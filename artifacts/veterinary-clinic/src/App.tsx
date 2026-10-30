import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ArrowLeft, ArrowRight, CalendarClock, CalendarDays, ChevronRight,
  ClipboardPlus, HeartPulse, Home, PawPrint, Pencil, Phone, Plus, Search,
  ShieldCheck, Stethoscope, Trash2, UserRound, UsersRound,
  X,
} from 'lucide-react';
import {
  getGetDashboardSummaryQueryKey, getGetPatientQueryKey,
  getGetVisitQueryKey, getListPatientVisitsQueryKey, getListPatientsQueryKey,
  getListVisitsQueryKey, useCreatePatient, useCreateVisit,
  useDeletePatient, useDeleteVisit, useGetDashboardSummary, useGetPatient,
  useGetVisit, useListPatientVisits, useListPatients, useListVisits,
  useUpdatePatient, useUpdateVisit,
} from '@workspace/api-client-react';
import type { Patient, PatientInput, Visit, VisitInput } from '@workspace/api-client-react';
import { Button, DetailItem, EmptyState, LoadingRows, PageHeading, QueryError, SpeciesIcon, errorText, formatDate } from '@/components/clinic-ui';
import { ErrorBoundary } from '@/components/error-boundary';
import { OwnerLinks } from '@/components/owner-links';
import { OwnerDetailPage, OwnersPage } from '@/pages/owners';
import { RecentVisitsPage } from '@/pages/recent-visits';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import { Form } from '@/components/ui/form';

const queryClient = new QueryClient();

const ownerSchema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre del responsable.'),
  phone: z.string().trim().min(1, 'Escribe un teléfono de contacto.'),
});

// Same rule as the API: equal name and phone digits are the same person.
const ownerKey = (owner: { name: string; phone: string }) =>
  `${owner.name.trim().replace(/\s+/g, ' ').toLowerCase()}|${owner.phone.replace(/\D/g, '')}`;

const patientSchema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre de la mascota.'),
  species: z.string().trim().min(1, 'Indica la especie.'),
  breed: z.string().trim(),
  age: z.number({ invalid_type_error: 'Indica una edad válida.' }).int('La edad debe ser un número entero de años.').min(0, 'La edad no puede ser negativa.'),
  sex: z.enum(['female', 'male'], { required_error: 'Selecciona el sexo.' }),
  owners: z.array(ownerSchema)
    .min(1, 'Registra al menos un responsable.')
    .refine((owners) => new Set(owners.map(ownerKey)).size === owners.length, 'No repitas al mismo responsable en una misma mascota.'),
});
type PatientFields = z.infer<typeof patientSchema>;

const visitSchema = z.object({
  patientId: z.number({ invalid_type_error: 'Selecciona una mascota.' }).min(1, 'Selecciona una mascota.'),
  visitDate: z.string().min(1, 'Indica la fecha y hora de la consulta.'),
  reason: z.string().trim().min(1, 'Describe el motivo de consulta.'),
  diagnosis: z.string().trim(),
  treatment: z.string().trim(),
  observations: z.string().trim(),
});
type VisitFields = z.infer<typeof visitSchema>;

function localDateTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function dateParts(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: '—', month: '—' };
  return {
    day: new Intl.DateTimeFormat('es', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('es', { month: 'short' }).format(date).replace('.', ''),
  };
}

function Modal({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar" data-testid="button-close-modal"><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel = 'Eliminar', pending, error, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel?: string; pending: boolean; error?: unknown; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal title={title} subtitle="Esta acción no se puede deshacer." onClose={onCancel}>
      <p style={{ color: '#71877a', fontSize: 13, lineHeight: 1.6, margin: '0 0 18px' }}>{message}</p>
      {error != null ? <div className="api-error" role="alert">{errorText(error)}</div> : null}
      <div className="modal-actions">
        <Button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="button" className="btn-danger" disabled={pending} onClick={onConfirm} data-testid="button-confirm-delete">
          <Trash2 size={15} />{pending ? 'Eliminando…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

function FieldError({ children }: { children?: ReactNode }) {
  return children ? <span className="form-error">{children}</span> : null;
}

function PatientEditor({ patient, onClose }: { patient?: Patient; onClose: () => void }) {
  const query = useQueryClient();
  const createPatient = useCreatePatient();
  const updatePatient = useUpdatePatient();
  const editing = Boolean(patient);
  const form = useForm<PatientFields>({
    resolver: zodResolver(patientSchema),
    defaultValues: patient ? {
      name: patient.name, species: patient.species, breed: patient.breed,
      age: patient.age, sex: patient.sex,
      owners: patient.owners.length > 0
        ? patient.owners.map(({ name, phone }) => ({ name, phone }))
        : [{ name: patient.ownerName, phone: patient.ownerPhone }],
    } : { name: '', species: '', breed: '', age: 0, sex: 'female', owners: [{ name: '', phone: '' }] },
  });
  const ownerFields = useFieldArray({ control: form.control, name: 'owners' });
  const ownersError = form.formState.errors.owners?.root?.message ?? form.formState.errors.owners?.message;
  const mutationError = editing ? updatePatient.error : createPatient.error;
  const pending = editing ? updatePatient.isPending : createPatient.isPending;

  const submit = (fields: PatientFields) => {
    const data: PatientInput = { ...fields };
    const onSuccess = async () => {
      await Promise.all([
        query.invalidateQueries({ queryKey: getListPatientsQueryKey() }),
        query.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
      ]);
      if (patient) await query.invalidateQueries({ queryKey: getGetPatientQueryKey(patient.id) });
      onClose();
    };
    if (patient) updatePatient.mutate({ id: patient.id, data }, { onSuccess });
    else createPatient.mutate({ data }, { onSuccess });
  };

  return (
    <Modal title={editing ? 'Editar paciente' : 'Nuevo paciente'} subtitle="Una ficha clara para cuidar mejor, visita tras visita." onClose={onClose}>
      {mutationError && <div className="api-error" role="alert">{errorText(mutationError)}</div>}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(submit)} noValidate>
          <div className="form-grid">
            <div className="form-field"><label htmlFor="patient-name">Nombre de la mascota *</label><input id="patient-name" className="field-input" placeholder="Nombre" data-testid="input-patient-name" {...form.register('name')} /><FieldError>{form.formState.errors.name?.message}</FieldError></div>
            <div className="form-field"><label htmlFor="patient-species">Especie *</label><input id="patient-species" className="field-input" placeholder="Perro, gato…" data-testid="input-patient-species" {...form.register('species')} /><FieldError>{form.formState.errors.species?.message}</FieldError></div>
            <div className="form-field"><label htmlFor="patient-breed">Raza</label><input id="patient-breed" className="field-input" placeholder="Raza o mestizo" data-testid="input-patient-breed" {...form.register('breed')} /><FieldError>{form.formState.errors.breed?.message}</FieldError></div>
            <div className="form-field"><label htmlFor="patient-age">Edad (años) *</label><input id="patient-age" className="field-input" type="number" min="0" step="1" data-testid="input-patient-age" {...form.register('age', { valueAsNumber: true })} /><FieldError>{form.formState.errors.age?.message}</FieldError></div>
            <div className="form-field"><label htmlFor="patient-sex">Sexo *</label><select id="patient-sex" className="field-select" data-testid="select-patient-sex" {...form.register('sex')}><option value="female">Hembra</option><option value="male">Macho</option></select><FieldError>{form.formState.errors.sex?.message}</FieldError></div>
            <div className="form-field full" data-testid="owners-fieldset">
              <span className="group-label">Responsables * <span className="hint">(una mascota puede tener más de uno)</span></span>
              <div className="owner-rows">
                {ownerFields.fields.map((field, index) => (
                  <div className="owner-row" key={field.id} data-testid={`owner-row-${index}`}>
                    <div className="form-field"><label htmlFor={`owner-name-${index}`}>Nombre del responsable {index + 1}</label><input id={`owner-name-${index}`} className="field-input" placeholder="Nombre y apellido" data-testid={`input-owner-name-${index}`} {...form.register(`owners.${index}.name`)} /><FieldError>{form.formState.errors.owners?.[index]?.name?.message}</FieldError></div>
                    <div className="form-field"><label htmlFor={`owner-phone-${index}`}>Teléfono del responsable {index + 1}</label><input id={`owner-phone-${index}`} className="field-input" type="tel" placeholder="Teléfono" data-testid={`input-owner-phone-${index}`} {...form.register(`owners.${index}.phone`)} /><FieldError>{form.formState.errors.owners?.[index]?.phone?.message}</FieldError></div>
                    {ownerFields.fields.length > 1 && <button type="button" className="icon-btn danger" onClick={() => ownerFields.remove(index)} aria-label={`Quitar responsable ${index + 1}`} data-testid={`button-remove-owner-${index}`}><Trash2 size={14} /></button>}
                  </div>
                ))}
              </div>
              <FieldError>{ownersError}</FieldError>
              <div><Button type="button" className="btn-secondary" onClick={() => ownerFields.append({ name: '', phone: '' })} data-testid="button-add-owner"><Plus size={14} />Agregar otro responsable</Button></div>
              <span className="hint">Si el nombre y el teléfono coinciden con un responsable ya registrado, se enlaza a esa misma persona.</span>
            </div>
          </div>
          <div className="modal-actions"><Button type="button" className="btn-secondary" onClick={onClose}>Cancelar</Button><Button type="submit" className="btn-primary" disabled={pending} data-testid="button-save-patient">{pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar paciente'}</Button></div>
        </form>
      </Form>
    </Modal>
  );
}

function VisitEditor({ visit, initialPatientId, onClose }: {
  visit?: Visit; initialPatientId?: number; onClose: () => void;
}) {
  const query = useQueryClient();
  const createVisit = useCreateVisit();
  const updateVisit = useUpdateVisit();
  const visitQuery = useGetVisit(visit?.id ?? 0, {
    query: { enabled: Boolean(visit?.id), queryKey: getGetVisitQueryKey(visit?.id ?? 0) },
  });
  const patientsQuery = useListPatients();
  const [formVisit, setFormVisit] = useState<Visit | undefined>(visit);
  const form = useForm<VisitFields>({
    resolver: zodResolver(visitSchema),
    defaultValues: {
      patientId: initialPatientId ?? visit?.patientId ?? 0,
      visitDate: visit ? localDateTime(visit.visitDate) : localDateTime(new Date().toISOString()),
      reason: visit?.reason ?? '', diagnosis: visit?.diagnosis ?? '',
      treatment: visit?.treatment ?? '', observations: visit?.observations ?? '',
    },
  });

  useEffect(() => {
    if (visitQuery.data) {
      const current = visitQuery.data;
      setFormVisit(current);
      form.reset({
        patientId: current.patientId, visitDate: localDateTime(current.visitDate),
        reason: current.reason, diagnosis: current.diagnosis,
        treatment: current.treatment, observations: current.observations,
      });
    }
  }, [visitQuery.data, form]);

  const editing = Boolean(visit);
  const mutationError = editing ? updateVisit.error : createVisit.error;
  const pending = editing ? updateVisit.isPending : createVisit.isPending;
  const submit = (fields: VisitFields) => {
    const data: VisitInput = { ...fields, visitDate: new Date(fields.visitDate).toISOString() };
    const onSuccess = async () => {
      await Promise.all([
        query.invalidateQueries({ queryKey: getListVisitsQueryKey() }),
        query.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
        query.invalidateQueries({ queryKey: getListPatientVisitsQueryKey(fields.patientId) }),
      ]);
      if (formVisit) {
        await query.invalidateQueries({ queryKey: getGetVisitQueryKey(formVisit.id) });
        await query.invalidateQueries({ queryKey: getListPatientVisitsQueryKey(formVisit.patientId) });
      }
      onClose();
    };
    if (formVisit) updateVisit.mutate({ id: formVisit.id, data }, { onSuccess });
    else createVisit.mutate({ data }, { onSuccess });
  };

  if (editing && visitQuery.isLoading) return (
    <Modal title="Editar consulta" subtitle="Cargando la ficha médica…" onClose={onClose}><div className="skeleton" style={{ height: 200 }} /></Modal>
  );
  if (editing && visitQuery.isError) return (
    <Modal title="Editar consulta" onClose={onClose}><div className="api-error">{errorText(visitQuery.error)}</div><div className="modal-actions"><Button type="button" className="btn-secondary" onClick={onClose}>Cerrar</Button><Button type="button" className="btn-primary" onClick={() => void visitQuery.refetch()}>Reintentar</Button></div></Modal>
  );

  return (
    <Modal title={editing ? 'Editar consulta' : 'Registrar consulta'} subtitle="Añade los detalles para mantener el historial al día." onClose={onClose}>
      {mutationError && <div className="api-error" role="alert">{errorText(mutationError)}</div>}
      {patientsQuery.isError && <div className="api-error" role="alert">No se pudieron cargar los pacientes: {errorText(patientsQuery.error)}</div>}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(submit)} noValidate>
          <div className="form-grid">
            <div className="form-field"><label htmlFor="visit-patient">Paciente *</label><select id="visit-patient" className="field-select" data-testid="select-visit-patient" {...form.register('patientId', { valueAsNumber: true })} disabled={patientsQuery.isLoading}><option value={0}>Selecciona una mascota</option>{patientsQuery.data?.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} · {patient.ownerName}</option>)}</select><FieldError>{form.formState.errors.patientId?.message}</FieldError></div>
            <div className="form-field"><label htmlFor="visit-date">Fecha y hora *</label><input id="visit-date" className="field-input" type="datetime-local" data-testid="input-visit-date" {...form.register('visitDate')} /><FieldError>{form.formState.errors.visitDate?.message}</FieldError></div>
            <div className="form-field full"><label htmlFor="visit-reason">Motivo de consulta *</label><input id="visit-reason" className="field-input" placeholder="¿Qué le trae hoy?" data-testid="input-visit-reason" {...form.register('reason')} /><FieldError>{form.formState.errors.reason?.message}</FieldError></div>
            <div className="form-field"><label htmlFor="visit-diagnosis">Diagnóstico</label><textarea id="visit-diagnosis" className="field-textarea" placeholder="Hallazgos y diagnóstico" data-testid="input-visit-diagnosis" {...form.register('diagnosis')} /><FieldError>{form.formState.errors.diagnosis?.message}</FieldError></div>
            <div className="form-field"><label htmlFor="visit-treatment">Tratamiento</label><textarea id="visit-treatment" className="field-textarea" placeholder="Indicaciones y medicación" data-testid="input-visit-treatment" {...form.register('treatment')} /><FieldError>{form.formState.errors.treatment?.message}</FieldError></div>
            <div className="form-field full"><label htmlFor="visit-observations">Observaciones</label><textarea id="visit-observations" className="field-textarea" placeholder="Notas adicionales para el seguimiento" data-testid="input-visit-observations" {...form.register('observations')} /><FieldError>{form.formState.errors.observations?.message}</FieldError></div>
          </div>
          <div className="modal-actions"><Button type="button" className="btn-secondary" onClick={onClose}>Cancelar</Button><Button type="submit" className="btn-primary" disabled={pending || patientsQuery.isLoading} data-testid="button-save-visit">{pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar consulta'}</Button></div>
        </form>
      </Form>
    </Modal>
  );
}

function Navigation() {
  const [location] = useLocation();
  const links = [
    { href: '/', label: 'Resumen', icon: Home },
    { href: '/patients', label: 'Pacientes', icon: PawPrint },
    { href: '/owners', label: 'Responsables', icon: UsersRound },
    { href: '/visits', label: 'Consultas', icon: CalendarDays },
    { href: '/recent', label: 'Últimos 30 días', icon: CalendarClock },
  ];
  const isActive = (href: string) => href === '/' ? location === '/' : location.startsWith(href);
  return (
    <>
      <aside className="clinic-sidebar">
        <Link href="/" className="clinic-brand" data-testid="link-brand">
          <span className="brand-mark"><PawPrint size={21} /></span>
          <span><span className="brand-title">Clínica Veterinaria</span><span className="brand-caption">Cuidado cercano</span></span>
        </Link>
        <div className="nav-label">Tu clínica</div>
        <nav className="clinic-nav" aria-label="Navegación principal">
          {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={isActive(href) ? 'active' : ''} data-testid={`link-nav-${label.toLowerCase()}`}><Icon size={17} />{label}</Link>)}
        </nav>
        <div className="side-note"><ShieldCheck size={19} /><strong>El cuidado, en orden</strong><p>Fichas e historial médico en un solo lugar para acompañar cada etapa.</p></div>
      </aside>
      <div className="clinic-main">
        <header className="topbar">
          <div><div className="topbar-kicker">Espacio de trabajo</div><div className="topbar-date">{formatDate(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
          <div className="profile-chip"><span>Equipo veterinario</span><div className="profile-dot"><Stethoscope size={16} /></div></div>
        </header>
        <nav className="mobile-nav" aria-label="Navegación principal móvil">
          {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={isActive(href) ? 'active' : ''} data-testid={`mobile-nav-${label.toLowerCase()}`}><Icon size={15} />{label}</Link>)}
        </nav>
        <main><RoutedErrorBoundary><Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/patients" component={PatientsPage} />
          <Route path="/patients/:id" component={PatientDetailPage} />
          <Route path="/owners" component={OwnersPage} />
          <Route path="/owners/:id" component={OwnerDetailPage} />
          <Route path="/visits" component={VisitsPage} />
          <Route path="/recent" component={RecentVisitsPage} />
          <Route component={NotFound} />
        </Switch></RoutedErrorBoundary></main>
      </div>
    </>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function DashboardPage() {
  const summary = useGetDashboardSummary();
  return (
    <div className="content-wrap">
      <PageHeading eyebrow="Clínica · resumen" title="Buenos días" subtitle="Un vistazo al cuidado de tus pacientes." />
      {summary.isLoading ? <div className="stats-grid">{[0, 1, 2].map((item) => <div className="stat-card skeleton" key={item} />)}</div> :
        summary.isError ? <div className="panel"><QueryError message={errorText(summary.error)} retry={() => void summary.refetch()} /></div> :
          !summary.data ? <div className="panel"><LoadingRows /></div> :
          <>
            <section className="stats-grid" aria-label="Totales">
              <StatCard label="Pacientes" value={summary.data.totalPatients} icon={<PawPrint size={16} />} testId="total-patients" />
              <StatCard label="Consultas registradas" value={summary.data.totalVisits} icon={<ClipboardPlus size={16} />} testId="total-visits" />
              <StatCard label="Visitas de hoy" value={summary.data.visitsToday} icon={<CalendarDays size={16} />} testId="visits-today" />
            </section>
            <section className="dashboard-layout">
              <div className="panel">
                <div className="panel-heading"><div><h2 className="panel-title">Atenciones recientes</h2><p className="panel-caption">El seguimiento más reciente de la clínica</p></div><Link href="/visits" className="text-link" data-testid="link-all-visits">Ver consultas <ArrowRight size={14} /></Link></div>
                {summary.data.recentVisits.length === 0 ? <EmptyState icon={<HeartPulse size={19} />} title="Todavía no hay atenciones" copy="Cuando registres una consulta, aparecerá aquí para tenerla siempre a mano." action={<Link href="/visits" className="text-link">Registrar primera consulta <ArrowRight size={14} /></Link>} /> :
                  <div className="visit-list">{summary.data.recentVisits.map((visit) => <VisitSummaryRow key={visit.id} visit={visit} />)}</div>}
              </div>
              <div>
                <div className="welcome-card"><h3>Cuidar también es recordar.</h3><p>Un historial completo ayuda a tomar mejores decisiones en cada visita.</p><Link href="/patients" data-testid="link-explore-patients">Ver pacientes <ArrowRight size={14} /></Link></div>
                <div className="soft-card"><div className="soft-card-label">Hoy en la clínica</div><div className="soft-card-value">{summary.data.visitsToday} {summary.data.visitsToday === 1 ? 'consulta' : 'consultas'}</div></div>
              </div>
            </section>
          </>}
    </div>
  );
}

function StatCard({ label, value, icon, testId }: { label: string; value: number; icon: ReactNode; testId: string }) {
  return <article className="stat-card" data-testid={`stat-${testId}`}><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><div className="stat-value" data-testid={`value-${testId}`}>{value}</div></article>;
}

function VisitSummaryRow({ visit }: { visit: { id: number; patientId: number; patientName: string; patientSpecies: string; visitDate: string; reason: string } }) {
  const date = dateParts(visit.visitDate);
  return <div className="visit-row" data-testid={`recent-visit-${visit.id}`}><div className="visit-date-chip"><b>{date.day}</b><small>{date.month}</small></div><div className="visit-row-content"><strong>{visit.patientName}</strong><span>{visit.patientSpecies} · {formatDate(visit.visitDate, { hour: '2-digit', minute: '2-digit' })}</span></div><span className="visit-reason">{visit.reason}</span><Link className="icon-btn" href={`/patients/${visit.patientId}`} aria-label={`Ver ficha de ${visit.patientName}`} data-testid={`link-recent-patient-${visit.id}`}><ChevronRight size={17} /></Link></div>;
}

function PatientsPage() {
  const [searchText, setSearchText] = useState('');
  const [editor, setEditor] = useState<Patient | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Patient | null>(null);
  const query = useQueryClient();
  const deletePatient = useDeletePatient();
  const params = useMemo(() => searchText.trim() ? { q: searchText.trim() } : undefined, [searchText]);
  const patients = useListPatients(params);
  const patientList = patients.data ?? [];
  const confirmDelete = () => {
    if (!deleting) return;
    deletePatient.mutate({ id: deleting.id }, {
      onSuccess: async () => {
        await Promise.all([
          query.invalidateQueries({ queryKey: getListPatientsQueryKey() }),
          query.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
          query.invalidateQueries({ queryKey: getListVisitsQueryKey() }),
        ]);
        setDeleting(null);
      },
    });
  };
  return (
    <div className="content-wrap">
      <PageHeading eyebrow="Directorio" title="Pacientes" subtitle="Cada paciente, su historia y las personas que le cuidan."><Button type="button" className="btn-primary" onClick={() => setEditor('new')} data-testid="button-add-patient"><Plus size={16} />Nuevo paciente</Button></PageHeading>
      <div className="toolbar"><div className="search-wrap"><Search size={17} /><input className="field-input" type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Buscar por mascota o responsable…" aria-label="Buscar pacientes" data-testid="input-search-patients" /></div><span className="muted" style={{ fontSize: 12 }}>{patients.data ? `${patients.data.length} ${patients.data.length === 1 ? 'paciente' : 'pacientes'}` : ''}</span></div>
      {patients.isError ? <div className="panel"><QueryError message={errorText(patients.error)} retry={() => void patients.refetch()} /></div> :
        patients.isLoading ? <div className="panel"><LoadingRows /></div> :
           patientList.length === 0 ? <div className="panel"><EmptyState icon={<PawPrint size={20} />} title={searchText ? 'No encontramos coincidencias' : 'Aún no hay pacientes'} copy={searchText ? 'Prueba con otro nombre de mascota o responsable.' : 'Registra el primer paciente para empezar a construir su historia clínica.'} action={!searchText ? <Button type="button" className="btn-primary" onClick={() => setEditor('new')}><Plus size={15} />Registrar paciente</Button> : undefined} /></div> :
             <div className="panel table-panel"><table className="data-table"><thead><tr><th>Mascota</th><th>Responsables</th><th>Contacto</th><th>Edad</th><th></th></tr></thead><tbody>{patientList.map((patient) => <tr key={patient.id} data-testid={`row-patient-${patient.id}`}><td><Link href={`/patients/${patient.id}`} style={{ color: 'inherit', textDecoration: 'none' }}><div className="pet-cell"><div className="pet-avatar"><SpeciesIcon species={patient.species} /></div><div><span className="pet-name">{patient.name}</span><span className="pet-meta">{patient.species}{patient.breed ? ` · ${patient.breed}` : ''}</span></div></div></Link></td><td><OwnerLinks owners={patient.owners} testIdPrefix={`link-patient-${patient.id}-owner`} /></td><td>{patient.owners.map((owner) => <span key={owner.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Phone size={13} />{owner.phone}</span>)}</td><td>{patient.age} {patient.age === 1 ? 'año' : 'años'}</td><td><div className="table-actions"><Link className="icon-btn" href={`/patients/${patient.id}`} aria-label={`Abrir ficha de ${patient.name}`} data-testid={`button-view-patient-${patient.id}`}><ArrowRight size={15} /></Link><button className="icon-btn" onClick={() => setEditor(patient)} aria-label={`Editar ${patient.name}`} data-testid={`button-edit-patient-${patient.id}`}><Pencil size={14} /></button><button className="icon-btn danger" onClick={() => setDeleting(patient)} aria-label={`Eliminar ${patient.name}`} data-testid={`button-delete-patient-${patient.id}`}><Trash2 size={14} /></button></div></td></tr>)}</tbody></table></div>}
      {editor && <PatientEditor patient={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />}
      {deleting && <ConfirmDialog title={`Eliminar a ${deleting.name}`} message={`Vas a eliminar la ficha de ${deleting.name} y todo su historial de consultas. Esta eliminación es permanente y no se podrá recuperar.`} pending={deletePatient.isPending} error={deletePatient.error} onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />}
      {deletePatient.error && !deleting && <div className="api-error" role="alert" style={{ marginTop: 16 }}>{errorText(deletePatient.error)}</div>}
    </div>
  );
}

function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const validId = Number.isInteger(id) && id > 0;
  const query = useQueryClient();
  const patientQuery = useGetPatient(validId ? id : 0, { query: { enabled: validId, queryKey: getGetPatientQueryKey(validId ? id : 0) } });
  const history = useListPatientVisits(validId ? id : 0, { query: { enabled: validId, queryKey: getListPatientVisitsQueryKey(validId ? id : 0) } });
  const deletePatient = useDeletePatient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [, navigate] = useLocation();
  const patient = patientQuery.data;
  const onDelete = () => {
    if (!patient) return;
    deletePatient.mutate({ id: patient.id }, {
      onSuccess: async () => {
        await Promise.all([
          query.invalidateQueries({ queryKey: getListPatientsQueryKey() }),
          query.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
          query.invalidateQueries({ queryKey: getListVisitsQueryKey() }),
        ]);
        setConfirmOpen(false);
        navigate('/patients');
      },
    });
  };
  if (!validId) return <div className="content-wrap"><QueryError message="El identificador del paciente no es válido." retry={() => navigate('/patients')} /></div>;
  if (patientQuery.isLoading) return <div className="content-wrap"><div className="skeleton" style={{ height: 125, borderRadius: 18, marginBottom: 18 }} /><div className="panel"><LoadingRows /></div></div>;
  if (patientQuery.isError || !patient) return <div className="content-wrap"><QueryError message={patientQuery.error ? errorText(patientQuery.error) : 'No encontramos este paciente.'} retry={() => void patientQuery.refetch()} /></div>;
  return (
    <div className="content-wrap">
      <PageHeading eyebrow="Ficha clínica" title="Historia del paciente" subtitle="Información y seguimiento médico en orden." />
      <Link href="/patients" className="text-link" style={{ marginBottom: 16 }} data-testid="link-back-patients"><ArrowLeft size={14} />Volver a pacientes</Link>
      <section className="patient-hero"><div className="pet-avatar"><SpeciesIcon species={patient.species} size={25} /></div><div><h2>{patient.name}</h2><p>{patient.species}{patient.breed ? ` · ${patient.breed}` : ''} · {patient.sex === 'female' ? 'Hembra' : 'Macho'}</p></div><div className="patient-hero-actions"><Button type="button" className="btn-secondary" onClick={() => setEditorOpen(true)} data-testid="button-edit-patient-detail"><Pencil size={14} />Editar</Button><Button type="button" className="btn-primary" onClick={() => setVisitOpen(true)} data-testid="button-add-visit-detail"><Plus size={15} />Consulta</Button><button className="icon-btn danger" onClick={() => setConfirmOpen(true)} aria-label="Eliminar paciente" data-testid="button-delete-patient-detail"><Trash2 size={15} /></button></div></section>
      <section className="detail-grid">
        <div className="panel"><div className="panel-heading"><div><h2 className="panel-title">Datos del paciente</h2><p className="panel-caption">Ficha de identificación y contacto</p></div><UserRound size={17} className="muted" /></div><div className="detail-list"><div className="detail-item" data-testid="patient-owners"><span>{patient.owners.length === 1 ? 'Responsable' : 'Responsables'}</span><OwnerLinks owners={patient.owners} showPhone testIdPrefix="link-patient-detail-owner" /></div><DetailItem label="Edad" value={`${patient.age} ${patient.age === 1 ? 'año' : 'años'}`} /><DetailItem label="Sexo" value={patient.sex === 'female' ? 'Hembra' : 'Macho'} /><DetailItem label="En la clínica desde" value={formatDate(patient.createdAt)} /></div></div>
        <div className="panel"><div className="panel-heading"><div><h2 className="panel-title">Historial médico</h2><p className="panel-caption">Registro cronológico de consultas y cuidados</p></div><span className="tag">{history.data?.length ?? '—'} consultas</span></div>
          {history.isLoading ? <LoadingRows /> : history.isError ? <QueryError message={errorText(history.error)} retry={() => void history.refetch()} /> : history.data?.length ? <div className="timeline">{[...history.data].sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()).map((visit) => <div className="timeline-entry" key={visit.id} data-testid={`history-entry-${visit.id}`}><span className="timeline-date">{formatDate(visit.visitDate, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><h4>{visit.reason}</h4><p>{visit.diagnosis || visit.treatment || visit.observations || 'Sin notas adicionales registradas.'}</p>{visit.treatment && <p style={{ marginTop: 5 }}><strong style={{ color: '#668875' }}>Tratamiento:</strong> {visit.treatment}</p>}</div>)}</div> : <EmptyState icon={<HeartPulse size={19} />} title="Aún no hay consultas" copy="El historial se irá construyendo con cada visita médica." action={<Button type="button" className="btn-secondary" onClick={() => setVisitOpen(true)}><Plus size={14} />Registrar consulta</Button>} />}
        </div>
      </section>
      {editorOpen && <PatientEditor patient={patient} onClose={() => setEditorOpen(false)} />}
      {visitOpen && <VisitEditor initialPatientId={patient.id} onClose={() => setVisitOpen(false)} />}
      {confirmOpen && <ConfirmDialog title={`Eliminar a ${patient.name}`} message={`Se eliminará permanentemente la ficha de ${patient.name} junto con todo su historial médico. Confirma solo si deseas borrar también cada consulta asociada.`} pending={deletePatient.isPending} error={deletePatient.error} onCancel={() => setConfirmOpen(false)} onConfirm={onDelete} />}
      {deletePatient.error && !confirmOpen && <div className="api-error" style={{ marginTop: 16 }} role="alert">{errorText(deletePatient.error)}</div>}
    </div>
  );
}

function VisitsPage() {
  const [editor, setEditor] = useState<Visit | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Visit | null>(null);
  const query = useQueryClient();
  const visits = useListVisits();
  const deleteVisit = useDeleteVisit();
  const confirmDelete = () => {
    if (!deleting) return;
    deleteVisit.mutate({ id: deleting.id }, {
      onSuccess: async () => {
        await Promise.all([
          query.invalidateQueries({ queryKey: getListVisitsQueryKey() }),
          query.invalidateQueries({ queryKey: getListPatientVisitsQueryKey(deleting.patientId) }),
          query.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
        ]);
        setDeleting(null);
      },
    });
  };
  const sortedVisits = useMemo(() => visits.data ? [...visits.data].sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()) : [], [visits.data]);
  return (
    <div className="content-wrap">
      <PageHeading eyebrow="Atención médica" title="Consultas" subtitle="Registro de visitas y acuerdos de cuidado."><Button type="button" className="btn-primary" onClick={() => setEditor('new')} data-testid="button-add-visit"><Plus size={16} />Nueva consulta</Button></PageHeading>
      {visits.isError ? <div className="panel"><QueryError message={errorText(visits.error)} retry={() => void visits.refetch()} /></div> : visits.isLoading ? <div className="panel"><LoadingRows /></div> : sortedVisits.length === 0 ? <div className="panel"><EmptyState icon={<CalendarDays size={20} />} title="Aún no hay consultas" copy="Registra la primera visita para iniciar el historial médico." action={<Button type="button" className="btn-primary" onClick={() => setEditor('new')}><Plus size={15} />Registrar consulta</Button>} /></div> :
        <div className="panel table-panel"><table className="data-table"><thead><tr><th>Fecha</th><th>Paciente</th><th>Motivo</th><th>Diagnóstico</th><th></th></tr></thead><tbody>{sortedVisits.map((visit) => <tr key={visit.id} data-testid={`row-visit-${visit.id}`}><td><span style={{ color: '#4b705b', fontWeight: 600 }}>{formatDate(visit.visitDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span><span className="pet-meta">{formatDate(visit.visitDate, { hour: '2-digit', minute: '2-digit' })}</span></td><td><Link href={`/patients/${visit.patientId}`} className="text-link" data-testid={`link-visit-patient-${visit.id}`}><div className="pet-avatar" style={{ width: 30, height: 30, borderRadius: 10 }}><SpeciesIcon species={visit.patientSpecies} size={14} /></div>{visit.patientName}</Link></td><td>{visit.reason}</td><td>{visit.diagnosis || <span className="muted">Sin diagnóstico</span>}</td><td><div className="table-actions"><button className="icon-btn" aria-label={`Editar consulta de ${visit.patientName}`} onClick={() => setEditor(visit)} data-testid={`button-edit-visit-${visit.id}`}><Pencil size={14} /></button><button className="icon-btn danger" aria-label={`Eliminar consulta de ${visit.patientName}`} onClick={() => setDeleting(visit)} data-testid={`button-delete-visit-${visit.id}`}><Trash2 size={14} /></button></div></td></tr>)}</tbody></table></div>}
      {editor && <VisitEditor visit={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />}
      {deleting && <ConfirmDialog title="Eliminar consulta" message={`Se eliminará la consulta de ${deleting.patientName} del ${formatDate(deleting.visitDate)}. El resto del historial del paciente permanecerá intacto.`} pending={deleteVisit.isPending} error={deleteVisit.error} onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />}
      {deleteVisit.error && !deleting && <div className="api-error" style={{ marginTop: 16 }} role="alert">{errorText(deleteVisit.error)}</div>}
    </div>
  );
}

function DashboardLayout() {
  return <div className="clinic-shell"><Navigation /></div>;
}

function Router() {
  return <DashboardLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
