import { ownerKeys } from "./owner-keys";
import {
  execute,
  insert,
  queryAll,
  queryOne,
  transaction,
  type OwnerRow,
  type PatientRow,
  type PatientWithOwners,
} from "./sqlite";

export type OwnerInput = { name: string; phone: string };

export function hasDuplicateOwners(owners: OwnerInput[]): boolean {
  const keys = owners.map(({ name, phone }) => {
    const { nameKey, phoneKey } = ownerKeys(name, phone);
    return `${nameKey}|${phoneKey}`;
  });
  return new Set(keys).size !== keys.length;
}

function findOrCreateOwner({ name, phone }: OwnerInput): OwnerRow {
  const { nameKey, phoneKey } = ownerKeys(name, phone);
  const existing = queryOne<OwnerRow>(
    "SELECT id, name, phone FROM owners WHERE name_key = ? AND phone_key = ?",
    nameKey,
    phoneKey,
  );
  if (existing) return existing;

  const trimmed = { name: name.trim(), phone: phone.trim() };
  const id = insert(
    "INSERT INTO owners (name, phone, name_key, phone_key) VALUES (?, ?, ?, ?)",
    trimmed.name,
    trimmed.phone,
    nameKey,
    phoneKey,
  );
  return { id, ...trimmed };
}

/** Replaces the owners of a patient. Call it inside a transaction. */
export function replacePatientOwners(patientId: number, owners: OwnerInput[]): void {
  execute("DELETE FROM patient_owners WHERE patient_id = ?", patientId);

  const resolved = owners.map(findOrCreateOwner);
  resolved.forEach((owner, position) => {
    execute(
      "INSERT INTO patient_owners (patient_id, owner_id, position) VALUES (?, ?, ?)",
      patientId,
      owner.id,
      position,
    );
  });

  const [primary] = resolved;
  execute(
    "UPDATE patients SET owner_name = ?, owner_phone = ? WHERE id = ?",
    primary.name,
    primary.phone,
    patientId,
  );
  pruneOrphanOwners();
}

/** An owner without pets is no longer part of the clinic's records. */
export function pruneOrphanOwners(): void {
  execute("DELETE FROM owners WHERE id NOT IN (SELECT owner_id FROM patient_owners)");
}

export function ownersByPatientId(patientIds: number[]): Map<number, OwnerRow[]> {
  const byPatient = new Map<number, OwnerRow[]>();
  if (patientIds.length === 0) return byPatient;

  const rows = queryAll<OwnerRow & { patientId: number }>(
    `SELECT po.patient_id AS patientId, o.id, o.name, o.phone
     FROM patient_owners po
     JOIN owners o ON o.id = po.owner_id
     WHERE po.patient_id IN (${patientIds.map(() => "?").join(", ")})
     ORDER BY po.patient_id, po.position`,
    ...patientIds,
  );
  for (const { patientId, ...owner } of rows) {
    byPatient.set(patientId, [...(byPatient.get(patientId) ?? []), owner]);
  }
  return byPatient;
}

export function attachOwners(patients: PatientRow[]): PatientWithOwners[] {
  const owners = ownersByPatientId(patients.map((patient) => patient.id));
  return patients.map((patient) => ({ ...patient, owners: owners.get(patient.id) ?? [] }));
}

/** Links patients stored before owners existed (single owner_name/owner_phone). */
export function migrateLegacyOwners(): void {
  const unlinked = queryAll<{ id: number; ownerName: string; ownerPhone: string }>(
    `SELECT id, owner_name AS ownerName, owner_phone AS ownerPhone
     FROM patients
     WHERE id NOT IN (SELECT patient_id FROM patient_owners)`,
  );
  if (unlinked.length === 0) return;

  transaction(() => {
    for (const patient of unlinked) {
      replacePatientOwners(patient.id, [
        { name: patient.ownerName, phone: patient.ownerPhone },
      ]);
    }
  });
}
