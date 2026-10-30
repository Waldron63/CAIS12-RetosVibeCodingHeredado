// Two owner entries are the same person when name and phone digits match.
export function ownerKeys(name: string, phone: string): {
  nameKey: string;
  phoneKey: string;
} {
  const digits = phone.replace(/\D/g, "");
  return {
    nameKey: name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es"),
    phoneKey: digits || phone.trim().toLocaleLowerCase("es"),
  };
}
