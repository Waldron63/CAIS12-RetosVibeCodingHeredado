import type { SQLInputValue } from "node:sqlite";
import { Router, type IRouter } from "express";
import {
  CreateVisitBody,
  CreateVisitResponse,
  DeleteVisitParams,
  DeleteVisitResponse,
  ExportVisitsCsvQueryParams,
  GetVisitParams,
  GetVisitResponse,
  ListPatientVisitsParams,
  ListPatientVisitsResponse,
  ListVisitsQueryParams,
  ListVisitsResponse,
  UpdateVisitBody,
  UpdateVisitParams,
  UpdateVisitResponse,
} from "@workspace/api-zod";
import { clinicDateTime, dateOnlyToClinicNoon, lastDaysWindow } from "../lib/clinic-time";
import { toCsv } from "../lib/csv";
import { validationMessage } from "../lib/http-errors";
import { ownersByPatientId } from "../lib/owners";
import {
  execute,
  insert,
  queryAll,
  queryOne,
  type VisitRow,
  type VisitWithOwners,
} from "../lib/sqlite";

const router: IRouter = Router();

const visitColumns = `
  v.id,
  v.patient_id AS patientId,
  p.name AS patientName,
  p.species AS patientSpecies,
  v.visit_date AS visitDate,
  v.reason,
  v.diagnosis,
  v.treatment,
  v.observations,
  v.created_at AS createdAt
`;

const CSV_HEADER = ["mascota", "responsable", "fecha", "motivo"];

// The full instant is stored so the time of the visit is not lost.
function normalizeVisitDate(value: Date): string {
  return value.toISOString();
}

// A date-only visitDate ("2026-10-30") is read as that day on the clinic's clock.
function withClinicDate(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return body;
  const payload = body as Record<string, unknown>;
  return { ...payload, visitDate: dateOnlyToClinicNoon(payload["visitDate"]) };
}

function attachOwnerNames(visits: VisitRow[]): VisitWithOwners[] {
  const owners = ownersByPatientId([...new Set(visits.map((visit) => visit.patientId))]);
  return visits.map((visit) => ({
    ...visit,
    ownerNames: (owners.get(visit.patientId) ?? []).map((owner) => owner.name).join(", "),
  }));
}

function findVisit(id: number): VisitWithOwners | undefined {
  const visit = queryOne<VisitRow>(
    `SELECT ${visitColumns}
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     WHERE v.id = ?`,
    id,
  );
  return visit ? attachOwnerNames([visit])[0] : undefined;
}

function listVisits(filters: {
  patientId?: number;
  days?: number;
}): VisitWithOwners[] {
  const conditions: string[] = [];
  const values: SQLInputValue[] = [];

  if (filters.patientId !== undefined) {
    conditions.push("v.patient_id = ?");
    values.push(filters.patientId);
  }
  if (filters.days !== undefined) {
    const { from, to } = lastDaysWindow(filters.days);
    conditions.push("v.visit_date >= ? AND v.visit_date < ?");
    values.push(from.toISOString(), to.toISOString());
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const visits = queryAll<VisitRow>(
    `SELECT ${visitColumns}
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     ${where}
     ORDER BY v.visit_date DESC, v.id DESC`,
    ...values,
  );
  return attachOwnerNames(visits);
}

router.get("/patients/:id/visits", (req, res): void => {
  const params = ListPatientVisitsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }

  const patientExists = queryOne<{ id: number }>(
    "SELECT id FROM patients WHERE id = ?",
    params.data.id,
  );
  if (!patientExists) {
    res.status(404).json({ error: "Paciente no encontrado." });
    return;
  }

  res.json(ListPatientVisitsResponse.parse(listVisits({ patientId: params.data.id })));
});

router.get("/visits", (req, res): void => {
  const params = ListVisitsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }

  res.json(ListVisitsResponse.parse(listVisits(params.data)));
});

// Declared before /visits/:id so "export" is not read as an id.
router.get("/visits/export", (req, res): void => {
  const params = ExportVisitsCsvQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }

  const { days } = params.data;
  const csv = toCsv(
    CSV_HEADER,
    listVisits({ days }).map((visit) => [
      visit.patientName,
      visit.ownerNames,
      clinicDateTime(new Date(visit.visitDate)),
      visit.reason,
    ]),
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="visitas-ultimos-${days}-dias.csv"`);
  res.send(csv);
});

router.post("/visits", (req, res): void => {
  const body = CreateVisitBody.safeParse(withClinicDate(req.body));
  if (!body.success) {
    res.status(400).json({ error: validationMessage(body.error) });
    return;
  }
  if (!body.data.reason.trim()) {
    res.status(400).json({ error: "Describe el motivo de consulta." });
    return;
  }

  const patientExists = queryOne<{ id: number }>(
    "SELECT id FROM patients WHERE id = ?",
    body.data.patientId,
  );
  if (!patientExists) {
    res.status(404).json({ error: "Paciente no encontrado." });
    return;
  }

  const id = insert(
    `INSERT INTO visits (patient_id, visit_date, reason, diagnosis, treatment, observations)
     VALUES (?, ?, ?, ?, ?, ?)`,
    body.data.patientId,
    normalizeVisitDate(body.data.visitDate),
    body.data.reason.trim(),
    body.data.diagnosis,
    body.data.treatment,
    body.data.observations,
  );
  const visit = findVisit(id);

  if (!visit) {
    res.status(500).json({ error: "No fue posible guardar la visita." });
    return;
  }

  res.status(201).json(CreateVisitResponse.parse(visit));
});

router.get("/visits/:id", (req, res): void => {
  const params = GetVisitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }

  const visit = findVisit(params.data.id);
  if (!visit) {
    res.status(404).json({ error: "Visita no encontrada." });
    return;
  }

  res.json(GetVisitResponse.parse(visit));
});

router.put("/visits/:id", (req, res): void => {
  const params = UpdateVisitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }
  const body = UpdateVisitBody.safeParse(withClinicDate(req.body));
  if (!body.success) {
    res.status(400).json({ error: validationMessage(body.error) });
    return;
  }
  if (!body.data.reason.trim()) {
    res.status(400).json({ error: "Describe el motivo de consulta." });
    return;
  }

  const patientExists = queryOne<{ id: number }>(
    "SELECT id FROM patients WHERE id = ?",
    body.data.patientId,
  );
  if (!patientExists) {
    res.status(404).json({ error: "Paciente no encontrado." });
    return;
  }

  const changed = execute(
    `UPDATE visits
     SET patient_id = ?, visit_date = ?, reason = ?, diagnosis = ?,
         treatment = ?, observations = ?
     WHERE id = ?`,
    body.data.patientId,
    normalizeVisitDate(body.data.visitDate),
    body.data.reason.trim(),
    body.data.diagnosis,
    body.data.treatment,
    body.data.observations,
    params.data.id,
  );
  if (!changed) {
    res.status(404).json({ error: "Visita no encontrada." });
    return;
  }

  const visit = findVisit(params.data.id);
  if (!visit) {
    res.status(404).json({ error: "Visita no encontrada." });
    return;
  }

  res.json(UpdateVisitResponse.parse(visit));
});

router.delete("/visits/:id", (req, res): void => {
  const params = DeleteVisitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }

  const deleted = execute("DELETE FROM visits WHERE id = ?", params.data.id);
  if (!deleted) {
    res.status(404).json({ error: "Visita no encontrada." });
    return;
  }

  DeleteVisitResponse.parse(undefined);
  res.sendStatus(204);
});

export default router;
