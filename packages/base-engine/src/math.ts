export function numericValues(values: unknown[]): number[] {
  return values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
}

export function sumNumbers(values: unknown[]): number {
  return numericValues(values).reduce((total, value) => total + value, 0);
}

export function meanNumbers(values: unknown[]): number | null {
  const numbers = numericValues(values);
  return numbers.length > 0 ? sumNumbers(numbers) / numbers.length : null;
}

export function minNumber(values: unknown[]): number | null {
  const numbers = numericValues(values);
  return numbers.length > 0 ? Math.min(...numbers) : null;
}

export function maxNumber(values: unknown[]): number | null {
  const numbers = numericValues(values);
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

export function medianNumbers(values: unknown[]): number | null {
  const numbers = numericValues(values).sort((left, right) => left - right);
  if (numbers.length === 0) return null;
  const middle = Math.floor(numbers.length / 2);
  if (numbers.length % 2 === 1) return numbers[middle] ?? null;
  return ((numbers[middle - 1] ?? 0) + (numbers[middle] ?? 0)) / 2;
}

export function stddevNumbers(values: unknown[]): number | null {
  const numbers = numericValues(values);
  const average = meanNumbers(numbers);
  if (average === null) return null;
  return Math.sqrt(
    numbers.reduce((total, value) => total + (value - average) ** 2, 0) /
      numbers.length,
  );
}
