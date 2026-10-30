import { Router, type IRouter } from "express";
import {
  GetOwnerParams,
  GetOwnerResponse,
  ListOwnersQueryParams,
  ListOwnersResponse,
} from "@workspace/api-zod";
import { validationMessage } from "../lib/http-errors";
import { attachOwners } from "../lib/owners";
import { queryAll, queryOne, type OwnerRow, type PatientRow } from "../lib/sqlite";

const router: IRouter = Router();

function escapeLike(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

router.get("/owners", (req, res): void => {
  const params = ListOwnersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }

  const search = params.data.q?.trim();
  const owners = search
    ? queryAll<OwnerRow>(
        `SELECT id, name, phone
         FROM owners
         WHERE name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\'
         ORDER BY name COLLATE NOCASE, id`,
        escapeLike(search),
        escapeLike(search),
      )
    : queryAll<OwnerRow>(
        "SELECT id, name, phone FROM owners ORDER BY name COLLATE NOCASE, id",
      );

  const petRows = queryAll<{ ownerId: number; petName: string }>(
    `SELECT po.owner_id AS ownerId, p.name AS petName
     FROM patient_owners po
     JOIN patients p ON p.id = po.patient_id
     ORDER BY p.name COLLATE NOCASE, p.id`,
  );
  const petNames = new Map<number, string[]>();
  for (const { ownerId, petName } of petRows) {
    petNames.set(ownerId, [...(petNames.get(ownerId) ?? []), petName]);
  }

  res.json(
    ListOwnersResponse.parse(
      owners.map((owner) => ({
        ...owner,
        patientCount: petNames.get(owner.id)?.length ?? 0,
        patientNames: petNames.get(owner.id) ?? [],
      })),
    ),
  );
});

router.get("/owners/:id", (req, res): void => {
  const params = GetOwnerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }

  const owner = queryOne<OwnerRow>(
    "SELECT id, name, phone FROM owners WHERE id = ?",
    params.data.id,
  );
  if (!owner) {
    res.status(404).json({ error: "Responsable no encontrado." });
    return;
  }

  const patients = queryAll<PatientRow>(
    `SELECT
       p.id,
       p.name,
       p.species,
       p.breed,
       p.age,
       p.sex,
       p.owner_name AS ownerName,
       p.owner_phone AS ownerPhone,
       p.created_at AS createdAt
     FROM patients p
     JOIN patient_owners po ON po.patient_id = p.id
     WHERE po.owner_id = ?
     ORDER BY p.name COLLATE NOCASE, p.id`,
    owner.id,
  );

  res.json(GetOwnerResponse.parse({ ...owner, patients: attachOwners(patients) }));
});

export default router;
