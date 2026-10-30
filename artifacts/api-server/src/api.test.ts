import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

const DAY_MS = 24 * 60 * 60 * 1000;

type Owner = { id: number; name: string; phone: string };
type Patient = { id: number; name: string; ownerName: string; owners: Owner[] };
type Visit = { id: number; visitDate: string; reason: string; ownerNames: string };
type OwnerSummary = Owner & { patientCount: number; patientNames: string[] };
type OwnerDetail = Owner & { patients: Patient[] };

const tempDir = mkdtempSync(path.join(os.tmpdir(), "vet-api-"));
const databasePath = path.join(tempDir, "test.sqlite");
process.env["SQLITE_DB_PATH"] = databasePath;
process.env["LOG_LEVEL"] = "silent";

// A database created by the first version of the app: one owner per patient, date-only visits.
function seedLegacyDatabase(): void {
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, species TEXT NOT NULL, breed TEXT NOT NULL DEFAULT '',
      age INTEGER NOT NULL, sex TEXT NOT NULL,
      owner_name TEXT NOT NULL, owner_phone TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      visit_date TEXT NOT NULL, reason TEXT NOT NULL,
      diagnosis TEXT NOT NULL DEFAULT '', treatment TEXT NOT NULL DEFAULT '',
      observations TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    INSERT INTO patients (name, species, breed, age, sex, owner_name, owner_phone)
      VALUES ('Firu', 'Perro', 'Mestizo', 5, 'male', 'Marta Díaz', '300 000 1111');
    INSERT INTO visits (patient_id, visit_date, reason) VALUES (1, '2025-01-15', 'Vacuna');
  `);
  legacy.close();
}

let server: Server;
let baseUrl = "";

async function call(method: string, route: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const isJson = response.headers.get("content-type")?.includes("json") ?? false;
  return {
    status: response.status,
    headers: response.headers,
    text,
    json: <T>() => (isJson ? (JSON.parse(text) as T) : (undefined as T)),
  };
}

const petInput = (name: string, owners: { name: string; phone: string }[]) => ({
  name,
  species: "Perro",
  breed: "Criollo",
  age: 3,
  sex: "female",
  owners,
});

const visitInput = (patientId: number, visitDate: string, reason: string) => ({
  patientId,
  visitDate,
  reason,
  diagnosis: "",
  treatment: "",
  observations: "",
});

describe("API", () => {
  let pairedPet: Patient;
  let sharedOwnerId: number;
  let secondOwnerId: number;

  before(async () => {
    seedLegacyDatabase();
    const { default: app } = await import("./app");
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  after(() => {
    server.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("data created by the first version", () => {
    it("links the single owner of an old patient", async () => {
      const response = await call("GET", "/patients/1");

      assert.equal(response.status, 200);
      const patient = response.json<Patient>();
      assert.deepEqual(patient.owners.map((owner) => owner.name), ["Marta Díaz"]);
    });

    it("keeps old date-only visits on the same clinic day", async () => {
      const visit = (await call("GET", "/visits/1")).json<Visit>();

      assert.equal(visit.visitDate, "2025-01-15T17:00:00.000Z");
    });
  });

  describe("owners", () => {
    it("registers a pet with two owners", async () => {
      const response = await call(
        "POST",
        "/patients",
        petInput("Rex", [
          { name: "Ana Gómez", phone: "300 111 2222" },
          { name: "Luis Gómez", phone: "300 333 4444" },
        ]),
      );

      assert.equal(response.status, 201);
      pairedPet = response.json<Patient>();
      assert.deepEqual(pairedPet.owners.map((owner) => owner.name), ["Ana Gómez", "Luis Gómez"]);
      assert.equal(pairedPet.ownerName, "Ana Gómez");
    });

    it("reuses an owner that is already registered instead of duplicating it", async () => {
      const response = await call(
        "POST",
        "/patients",
        petInput("Toby", [{ name: "  ana   gómez ", phone: "3001112222" }]),
      );
      assert.equal(response.status, 201);

      const owners = (await call("GET", "/owners")).json<OwnerSummary[]>();
      const ana = owners.filter((owner) => owner.name === "Ana Gómez");
      assert.equal(ana.length, 1);
      assert.equal(ana[0].patientCount, 2);
      assert.deepEqual(ana[0].patientNames, ["Rex", "Toby"]);
      sharedOwnerId = ana[0].id;
      secondOwnerId = owners.find((owner) => owner.name === "Luis Gómez")!.id;
    });

    it("shows every pet of an owner, with the other owners of each pet", async () => {
      const detail = (await call("GET", `/owners/${sharedOwnerId}`)).json<OwnerDetail>();

      assert.deepEqual(detail.patients.map((patient) => patient.name), ["Rex", "Toby"]);
      assert.deepEqual(
        detail.patients.find((patient) => patient.name === "Rex")!.owners.map((owner) => owner.name),
        ["Ana Gómez", "Luis Gómez"],
      );
    });

    it("still accepts a single ownerName and ownerPhone", async () => {
      const response = await call("POST", "/patients", {
        name: "Nina",
        species: "Gato",
        breed: "",
        age: 1,
        sex: "female",
        ownerName: "Carla Ruiz",
        ownerPhone: "311 000 0000",
      });

      assert.equal(response.status, 201);
      assert.deepEqual(response.json<Patient>().owners.map((owner) => owner.name), ["Carla Ruiz"]);
    });

    it("finds a pet by the name of any of its owners", async () => {
      const found = (await call("GET", "/patients?q=luis")).json<Patient[]>();

      assert.deepEqual(found.map((patient) => patient.name), ["Rex"]);
    });

    it("answers 404 for an unknown owner", async () => {
      assert.equal((await call("GET", "/owners/9999")).status, 404);
    });

    it("rejects invalid pets with a readable message", async () => {
      const repeated = await call(
        "POST",
        "/patients",
        petInput("Dup", [
          { name: "Ana Gómez", phone: "300 111 2222" },
          { name: "ANA GÓMEZ", phone: "3001112222" },
        ]),
      );
      const withoutOwners = await call("POST", "/patients", {
        ...petInput("Solo", []),
        owners: undefined,
      });
      const blankName = await call("POST", "/patients", petInput("   ", [{ name: "A", phone: "1" }]));
      const decimalAge = await call("POST", "/patients", {
        ...petInput("Edad", [{ name: "A", phone: "1" }]),
        age: 1.5,
      });

      assert.equal(repeated.status, 400);
      assert.match(repeated.text, /No repitas al mismo responsable/);
      assert.equal(withoutOwners.status, 400);
      assert.equal(blankName.status, 400);
      assert.equal(decimalAge.status, 400);
      assert.match(decimalAge.text, /Datos inválidos \(age:/);
    });
  });

  describe("visits of the last 30 days", () => {
    const reasons = { recent: "Visita reciente", edge: "Visita hace 29 días", old: "Visita antigua" };

    before(async () => {
      const now = Date.now();
      for (const [reason, daysAgo] of [
        [reasons.recent, 1],
        [reasons.edge, 29],
        [reasons.old, 30],
      ] as const) {
        const date = new Date(now - daysAgo * DAY_MS).toISOString();
        const response = await call("POST", "/visits", visitInput(pairedPet.id, date, reason));
        assert.equal(response.status, 201);
      }
    });

    it("lists only visits inside the window", async () => {
      const visits = (await call("GET", "/visits?days=30")).json<Visit[]>();

      const listed = visits.map((visit) => visit.reason);
      assert.ok(listed.includes(reasons.recent));
      assert.ok(listed.includes(reasons.edge));
      assert.ok(!listed.includes(reasons.old), "visits older than 30 days must not appear");
      assert.ok(!listed.includes("Vacuna"), "the old visit of the legacy data must not appear");
    });

    it("still lists every visit when no window is requested", async () => {
      const visits = (await call("GET", "/visits")).json<Visit[]>();

      assert.ok(visits.some((visit) => visit.reason === reasons.old));
      assert.ok(visits.some((visit) => visit.reason === "Vacuna"));
    });

    it("exports pet, owner, date and reason as a CSV download", async () => {
      const response = await call("GET", "/visits/export?days=30");

      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /^text\/csv/);
      assert.match(response.headers.get("content-disposition") ?? "", /^attachment; filename="visitas-ultimos-30-dias\.csv"$/);
      const lines = response.text.replace(/^\uFEFF/, "").trimEnd().split("\r\n");
      assert.equal(lines[0], "mascota,responsable,fecha,motivo");
      assert.equal(lines.length, 3);
      assert.match(lines[1], /^Rex,"Ana Gómez, Luis Gómez",\d{4}-\d{2}-\d{2} \d{2}:\d{2},Visita reciente$/);
      assert.ok(!response.text.includes(reasons.old));
    });

    it("rejects an invalid window", async () => {
      assert.equal((await call("GET", "/visits/export?days=0")).status, 400);
      assert.equal((await call("GET", "/visits?days=abc")).status, 400);
    });
  });

  describe("visit dates", () => {
    it("keeps the time of the visit and the clinic's day", async () => {
      const response = await call(
        "POST",
        "/visits",
        visitInput(pairedPet.id, "2026-03-05T20:30:00-05:00", "Control nocturno"),
      );

      assert.equal(response.json<Visit>().visitDate, "2026-03-06T01:30:00.000Z");
      const csv = (await call("GET", "/visits/export?days=3650")).text;
      assert.match(csv, /2026-03-05 20:30,Control nocturno/);
    });

    it("reads a date-only visit as that day on the clinic's clock", async () => {
      const response = await call("POST", "/visits", visitInput(pairedPet.id, "2026-03-04", "Solo fecha"));

      assert.equal(response.json<Visit>().visitDate, "2026-03-04T17:00:00.000Z");
    });

    it("counts a visit made now in today's total", async () => {
      await call("POST", "/visits", visitInput(pairedPet.id, new Date().toISOString(), "Hoy"));
      const dashboard = (await call("GET", "/dashboard")).json<{ visitsToday: number }>();

      assert.ok(dashboard.visitsToday >= 1);
    });
  });

  describe("deleting a pet", () => {
    it("removes owners that no longer have pets and keeps the shared ones", async () => {
      assert.equal((await call("DELETE", `/patients/${pairedPet.id}`)).status, 204);

      assert.equal((await call("GET", `/owners/${secondOwnerId}`)).status, 404);
      const shared = (await call("GET", `/owners/${sharedOwnerId}`)).json<OwnerDetail>();
      assert.deepEqual(shared.patients.map((patient) => patient.name), ["Toby"]);
    });
  });
});
