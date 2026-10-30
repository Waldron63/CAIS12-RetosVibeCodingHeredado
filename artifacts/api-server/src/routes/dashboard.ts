import { Router, type IRouter } from "express";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import { lastDaysWindow } from "../lib/clinic-time";
import {
  queryAll,
  queryOne,
  type RecentVisitRow,
} from "../lib/sqlite";

const router: IRouter = Router();

router.get("/dashboard", (_req, res): void => {
  // "Today" is the clinic's calendar day (America/Bogota).
  const today = lastDaysWindow(1);
  const totals = queryOne<{
    totalPatients: number;
    totalVisits: number;
    visitsToday: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM patients) AS totalPatients,
      (SELECT COUNT(*) FROM visits) AS totalVisits,
      (SELECT COUNT(*) FROM visits WHERE visit_date >= ? AND visit_date < ?) AS visitsToday
  `, today.from.toISOString(), today.to.toISOString());

  const recentVisits = queryAll<RecentVisitRow>(`
    SELECT
      v.id,
      v.patient_id AS patientId,
      p.name AS patientName,
      p.species AS patientSpecies,
      v.visit_date AS visitDate,
      v.reason
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    ORDER BY v.visit_date DESC, v.id DESC
    LIMIT 6
  `);

  const result = {
    totalPatients: totals?.totalPatients ?? 0,
    totalVisits: totals?.totalVisits ?? 0,
    visitsToday: totals?.visitsToday ?? 0,
    recentVisits,
  };
  res.json(GetDashboardSummaryResponse.parse(result));
});

export default router;
