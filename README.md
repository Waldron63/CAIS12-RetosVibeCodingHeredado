# Clínica Veterinaria

Sistema web full-stack para que una clínica veterinaria de barrio gestione sus pacientes, propietarios y visitas médicas en una interfaz en español.

## Objetivo

Centralizar la información de cada mascota y su historial de atención, de modo que el equipo pueda encontrar pacientes, registrar consultas y revisar diagnósticos y tratamientos anteriores.

## Funcionalidades

- Panel con total de pacientes, total de visitas, visitas del día y atenciones recientes.
- Registro, búsqueda, consulta, edición y eliminación confirmada de pacientes.
- **Varios responsables por mascota:** una mascota puede tener más de un responsable (por ejemplo, toda una familia) y un responsable puede tener varias mascotas.
- **Responsables:** directorio con búsqueda; al abrir un responsable se ven todas sus mascotas, y al abrir una mascota se ven todos sus responsables.
- Registro, consulta, edición y eliminación de visitas médicas asociadas a un paciente.
- Historial médico por paciente ordenado de la visita más reciente a la más antigua.
- **Últimos 30 días:** vista con las visitas de los últimos 30 días (las más antiguas no aparecen) y botón **Exportar CSV** con mascota, responsable, fecha y motivo.
- Validación de datos, mensajes de error y persistencia local en SQLite.
- Eliminación en cascada del historial al eliminar un paciente, para evitar visitas sin paciente.

## Tecnologías

- Interfaz: React, TypeScript, Vite y Tailwind CSS.
- API REST: Node.js y Express 5.
- Base de datos: SQLite mediante `node:sqlite` integrado en Node.js 24.
- Contratos y validación: OpenAPI y esquemas Zod generados.

## Estructura del proyecto

```text
artifacts/
  api-server/          API Express y base de datos SQLite (incluye sus pruebas: src/**/*.test.ts)
  veterinary-clinic/   Interfaz web React
    src/pages/         Responsables (lista y ficha) y Últimos 30 días
    src/components/    Componentes compartidos (clinic-ui, owner-links)
lib/
  api-spec/            Contrato OpenAPI
  api-client-react/    Hooks React Query generados
  api-zod/             Validación Zod generada
README.md
```

## Requisitos previos

- Node.js 24 o compatible con `node:sqlite`.
- pnpm (probado con pnpm 12; `npm install` y `yarn` no sirven: el proyecto exige pnpm).

## Instalación y ejecución local

Instala las dependencias desde la raíz del proyecto:

```bash
pnpm install
```

Inicia la API y la interfaz con un solo comando:

```bash
pnpm dev
```

También puedes abrir dos terminales desde la raíz del proyecto. La primera inicia la API en el puerto 8080 (usa `PORT` para cambiarlo):

```bash
pnpm --filter @workspace/api-server run dev
```

La segunda inicia la interfaz en el puerto 5173:

```bash
pnpm --filter @workspace/veterinary-clinic run dev
```

Abre `http://localhost:5173` en el navegador. Fuera de Replit, Vite envía automáticamente las solicitudes `/api` al servidor Express en `http://localhost:8080`. Si la API usa otra dirección, configura `API_PROXY_TARGET` al iniciar la interfaz (por ejemplo `API_PROXY_TARGET=http://localhost:9000`).

En Replit, inicia los workflows **API Server** y **Clínica Veterinaria** para abrir la vista previa conectada. Replit asigna sus propios puertos y enruta `/api`; el proxy local de Vite se habilita solamente fuera de Replit.

Para comprobar los tipos:

```bash
pnpm run typecheck
```

Para ejecutar las pruebas automáticas de la API (base SQLite temporal, no toca tus datos) y construir todo:

```bash
pnpm test
pnpm run build
```

> El puerto 5000 no sirve en macOS: lo ocupa el receptor de AirPlay (responde `403`). Por eso la API usa el 8080.

## Cómo verificarla

Con `pnpm dev` en marcha y la app abierta en `http://localhost:5173`:

1. **Mascota con dos responsables:** en *Pacientes → Nuevo paciente* completa la mascota y, en *Responsables*, escribe el primero; pulsa **Agregar otro responsable** y escribe el segundo. Al registrar, la tabla muestra ambos responsables.
2. **Abrir una mascota:** haz clic en su nombre; la ficha lista todos sus responsables con su teléfono.
3. **Abrir un responsable:** haz clic en un responsable (en la tabla, en la ficha o en *Responsables*); verás todas sus mascotas. Si registras otra mascota con el mismo nombre y teléfono, el responsable se **reutiliza** y aparece con ambas mascotas.
4. **Últimos 30 días:** abre *Últimos 30 días*; solo salen las consultas de los últimos 30 días. Crea una consulta con fecha de hace 40 días en *Consultas* y comprueba que **no** aparece en esta vista (sí en *Consultas*).
5. **Exportar CSV:** en *Últimos 30 días* pulsa **Exportar CSV**; se descarga `visitas-ultimos-30-dias.csv` con las columnas `mascota,responsable,fecha,motivo` (fecha y hora de la clínica, hora de Bogotá).
6. **Lo anterior sigue funcionando:** panel, búsqueda, edición y eliminación de pacientes, y alta, edición y eliminación de consultas.

## Base de datos

La API crea las tablas e índices SQLite al iniciar. Por defecto, el archivo se guarda en:

```text
artifacts/api-server/data/veterinary-clinic.sqlite
```

La carpeta de datos se crea automáticamente y está excluida del control de versiones. Para elegir otro archivo, define `SQLITE_DB_PATH` antes de iniciar el servidor. Las tablas `patients` y `visits` mantienen una relación de uno a muchos; las visitas se eliminan automáticamente al borrar al paciente asociado.

Los responsables viven en la tabla `owners` y se enlazan con las mascotas mediante `patient_owners` (relación de muchos a muchos). Un responsable se identifica por nombre y teléfono (sin importar mayúsculas, espacios ni formato del teléfono) y desaparece cuando se elimina su última mascota. `patients.owner_name` y `owner_phone` conservan al primer responsable por compatibilidad.

Las fechas de las visitas se guardan con fecha **y hora** (instante UTC) y se interpretan con la hora de Bogotá. Al iniciar, la API migra sola las bases creadas con la versión anterior: enlaza a cada paciente con su responsable y conserva el día de las visitas que solo tenían fecha.

No se insertan datos de demostración automáticamente. Los registros creados desde la interfaz se conservan en el archivo SQLite al recargar la aplicación.

## API REST

La API está disponible bajo el prefijo `/api`. Los ejemplos usan `http://localhost:8080/api` para ejecución local. En Replit, define `API_BASE=http://localhost:80/api` para usar el proxy del proyecto.

### Pacientes

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/patients?q=` | Lista pacientes; busca por nombre de mascota o de cualquiera de sus responsables |
| GET | `/api/patients/:id` | Consulta la ficha de un paciente, con todos sus responsables (`owners`) |
| POST | `/api/patients` | Registra un paciente con uno o varios responsables (`owners`) |
| PUT | `/api/patients/:id` | Actualiza un paciente y sus responsables |
| DELETE | `/api/patients/:id` | Elimina al paciente y sus visitas asociadas |
| GET | `/api/patients/:id/visits` | Consulta su historial médico más reciente primero |

### Responsables

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/owners?q=` | Lista responsables con el número y los nombres de sus mascotas; busca por nombre o teléfono |
| GET | `/api/owners/:id` | Consulta un responsable y todas sus mascotas |

### Visitas

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/visits?patientId=&days=` | Lista visitas; `patientId` y `days` (últimos N días, hoy incluido) son opcionales |
| GET | `/api/visits/export?days=30` | Descarga un CSV (`mascota,responsable,fecha,motivo`) de los últimos N días (30 por defecto) |
| GET | `/api/visits/:id` | Consulta una visita |
| POST | `/api/visits` | Registra una visita |
| PUT | `/api/visits/:id` | Actualiza una visita |
| DELETE | `/api/visits/:id` | Elimina una visita |

### Panel

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/dashboard` | Totales y visitas recientes |

## Ejemplos

Registrar un paciente con dos responsables:

```bash
API_BASE="${API_BASE:-http://localhost:8080/api}"

curl -X POST "$API_BASE/patients" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Luna",
    "species": "Perro",
    "breed": "Criolla",
    "age": 3,
    "sex": "female",
    "owners": [
      { "name": "Ana Pérez", "phone": "3001234567" },
      { "name": "Luis Pérez", "phone": "3009876543" }
    ]
  }'
```

El formato anterior, con un único responsable (`ownerName` y `ownerPhone`), sigue funcionando:

```bash
curl -X POST "$API_BASE/patients" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Luna",
    "species": "Perro",
    "breed": "Criolla",
    "age": 3,
    "sex": "female",
    "ownerName": "Ana Pérez",
    "ownerPhone": "3001234567"
  }'
```

Registrar una visita para un paciente existente (cambia `patientId` por el identificador devuelto al crear el paciente). `visitDate` acepta fecha y hora (`2026-10-30T09:30:00-05:00`) o solo la fecha (`2026-10-30`, que se toma como ese día en la clínica):

```bash
curl -X POST "$API_BASE/visits" \
  -H 'Content-Type: application/json' \
  -d '{
    "patientId": 1,
    "visitDate": "2026-10-30",
    "reason": "Control general",
    "diagnosis": "Buen estado de salud",
    "treatment": "Continuar controles preventivos",
    "observations": ""
  }'
```

Consultar el historial:

```bash
curl "$API_BASE/patients/1/visits"
```

Consultar las visitas de los últimos 30 días y descargarlas en CSV:

```bash
curl "$API_BASE/visits?days=30"
curl -o visitas.csv "$API_BASE/visits/export?days=30"
```

Consultar un responsable y todas sus mascotas:

```bash
curl "$API_BASE/owners/1"
```

## Cambios sobre la versión heredada

- **Instalación:** `pnpm install` terminaba con error en pnpm 11 o superior (`ERR_PNPM_IGNORED_BUILDS`, esbuild); se añadió `allowBuilds` en `pnpm-workspace.yaml` junto a la lista anterior (`onlyBuiltDependencies`).
- **Ejecución:** `pnpm dev` levanta API e interfaz a la vez; `pnpm run build` ya no falla por el lienzo de diseño `mockup-sandbox`, que exige variables de Replit.
- **README:** el puerto de la API es 8080 (no 5000) y la variable del proxy es `API_PROXY_TARGET` (no `LOCAL_API_ORIGIN`).
- **Fechas de las visitas:** antes se guardaba solo la fecha en UTC y se perdía la hora (una consulta a las 8:30 p. m. quedaba en el día siguiente y no contaba como «hoy»). Ahora se guarda fecha y hora y se interpreta con la hora de Bogotá.
- **Edad:** el formulario aceptaba decimales pero la API los rechaza; ahora exige un número entero.
- **Errores:** la API devuelve mensajes legibles en lugar del volcado de Zod, y rechaza nombres o motivos formados solo por espacios (antes provocaban un error 500).
- **Búsqueda:** los caracteres `%` y `_` ya no se interpretan como comodines.
- **Interfaz:** la página base está en español (`lang="es"` y descripción propia) y el mensaje del `ErrorBoundary` también.
- **Pruebas:** se añadieron pruebas automáticas de la API (`pnpm test`).
