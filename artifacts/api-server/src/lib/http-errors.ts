type ValidationIssue = { path: PropertyKey[]; message: string };

/** Readable message for the UI instead of the raw Zod issue list. */
export function validationMessage(error: { issues: ValidationIssue[] }): string {
  const details = error.issues
    .map((issue) => `${issue.path.map(String).join(".") || "datos"}: ${issue.message}`)
    .join("; ");
  return `Datos inválidos (${details}).`;
}
