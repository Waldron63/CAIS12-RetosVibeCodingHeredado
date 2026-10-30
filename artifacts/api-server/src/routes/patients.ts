import { Router, type IRouter } from "express";
import {
  CreatePatientBody,
  CreatePatientResponse,
  DeletePatientParams,
  DeletePatientResponse,
  GetPatientParams,
  GetPatientResponse,
  ListPatientsQueryParams,
  ListPatientsResponse,
  UpdatePatientBody,
  UpdatePatientParams,
  UpdatePatientResponse,
} from "@workspace/api-zod";
import { validationMessage } from "../lib/http-errors";
import {
  attachOwners,
  hasDuplicateOwners,
  pruneOrphanOwners,
  replacePatientOwners,
  type OwnerInput,
} from "../lib/owners";
import {
  execute,
  insert,
  queryAll,
  queryOne,
  transaction,
  type PatientRow,
} from "../lib/sqlite";

const router: IRouter = Router();

const patientColumns = `
  id,
  name,
  species,
  breed,
  age,
  sex,
  owner_name AS ownerName,
  owner_phone AS ownerPhone,
  created_at AS createdAt
`;

type OwnersPayload = {
  owners?: OwnerInput[];
  ownerName?: string;
  ownerPhone?: string;
};

// Accepts the list of owners or, for older clients, a single ownerName/ownerPhone.
function resolveOwners(body: OwnersPayload): OwnerInput[] | string {
  const owners =
    body.owners && body.owners.length > 0
      ? body.owners
      : body.ownerName && body.ownerPhone
        ? [{ name: body.ownerName, phone: body.ownerPhone }]
        : [];

  if (owners.length === 0) {
    return "Indica al menos un responsable con nombre y teléfono.";
  }
  if (owners.some((owner) => !owner.name.trim() || !owner.phone.trim())) {
    return "Cada responsable necesita nombre y teléfono.";
  }
  if (hasDuplicateOwners(owners)) {
    return "No repitas al mismo responsable en una misma mascota.";
  }
  return owners;
}

function escapeLike(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

function findPatient(id: number) {
  const patient = queryOne<PatientRow>(
    `SELECT ${patientColumns} FROM patients WHERE id = ?`,
    id,
  );
  return patient ? attachOwners([patient])[0] : undefined;
}

router.get("/patients", (req, res): void => {
  const params = ListPatientsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }

  const search = params.data.q?.trim();
  const patients = search
    ? queryAll<PatientRow>(
        `SELECT ${patientColumns}
         FROM patients
         WHERE name LIKE ? ESCAPE '\\'
            OR EXISTS (
              SELECT 1
              FROM patient_owners po
              JOIN owners o ON o.id = po.owner_id
              WHERE po.patient_id = patients.id AND o.name LIKE ? ESCAPE '\\'
            )
         ORDER BY name COLLATE NOCASE, id`,
        escapeLike(search),
        escapeLike(search),
      )
    : queryAll<PatientRow>(
        `SELECT ${patientColumns}
         FROM patients
         ORDER BY name COLLATE NOCASE, id`,
      );

  res.json(ListPatientsResponse.parse(attachOwners(patients)));
});

router.post("/patients", (req, res): void => {
  const body = CreatePatientBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: validationMessage(body.error) });
    return;
  }
  if (!body.data.name.trim() || !body.data.species.trim()) {
    res.status(400).json({ error: "Escribe el nombre y la especie de la mascota." });
    return;
  }
  const owners = resolveOwners(body.data);
  if (typeof owners === "string") {
    res.status(400).json({ error: owners });
    return;
  }

  const id = transaction(() => {
    const patientId = insert(
      `INSERT INTO patients (name, species, breed, age, sex, owner_name, owner_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      body.data.name.trim(),
      body.data.species.trim(),
      body.data.breed.trim(),
      body.data.age,
      body.data.sex,
      owners[0].name.trim(),
      owners[0].phone.trim(),
    );
    replacePatientOwners(patientId, owners);
    return patientId;
  });
  const patient = findPatient(id);

  if (!patient) {
    res.status(500).json({ error: "No fue posible guardar el paciente." });
    return;
  }

  res.status(201).json(CreatePatientResponse.parse(patient));
});

router.get("/patients/:id", (req, res): void => {
  const params = GetPatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }

  const patient = findPatient(params.data.id);
  if (!patient) {
    res.status(404).json({ error: "Paciente no encontrado." });
    return;
  }

  res.json(GetPatientResponse.parse(patient));
});

router.put("/patients/:id", (req, res): void => {
  const params = UpdatePatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }
  const body = UpdatePatientBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: validationMessage(body.error) });
    return;
  }
  if (!body.data.name.trim() || !body.data.species.trim()) {
    res.status(400).json({ error: "Escribe el nombre y la especie de la mascota." });
    return;
  }
  const owners = resolveOwners(body.data);
  if (typeof owners === "string") {
    res.status(400).json({ error: owners });
    return;
  }

  const changed = transaction(() => {
    const updated = execute(
      `UPDATE patients
       SET name = ?, species = ?, breed = ?, age = ?, sex = ?
       WHERE id = ?`,
      body.data.name.trim(),
      body.data.species.trim(),
      body.data.breed.trim(),
      body.data.age,
      body.data.sex,
      params.data.id,
    );
    if (updated) replacePatientOwners(params.data.id, owners);
    return updated;
  });
  if (!changed) {
    res.status(404).json({ error: "Paciente no encontrado." });
    return;
  }

  const patient = findPatient(params.data.id);
  if (!patient) {
    res.status(404).json({ error: "Paciente no encontrado." });
    return;
  }

  res.json(UpdatePatientResponse.parse(patient));
});

router.delete("/patients/:id", (req, res): void => {
  const params = DeletePatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: validationMessage(params.error) });
    return;
  }

  const deleted = transaction(() => {
    const count = execute("DELETE FROM patients WHERE id = ?", params.data.id);
    if (count) pruneOrphanOwners();
    return count;
  });
  if (!deleted) {
    res.status(404).json({ error: "Paciente no encontrado." });
    return;
  }

  DeletePatientResponse.parse(undefined);
  res.sendStatus(204);
});

export default router;
