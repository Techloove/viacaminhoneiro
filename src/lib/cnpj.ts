export function validCnpj(value: string) {
  if (!/^\d{14}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  const digit = (base: string) => {
    let weight = base.length - 7;
    let sum = 0;
    for (const c of base) {
      sum += Number(c) * weight--;
      if (weight < 2) weight = 9;
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  return (
    digit(value.slice(0, 12)) === Number(value[12]) &&
    digit(value.slice(0, 13)) === Number(value[13])
  );
}
