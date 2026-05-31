export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function padDatePart(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

function formatLocalTimestamp(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const offsetAbsolute = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(offsetAbsolute / 60);
  const offsetRemainingMinutes = offsetAbsolute % 60;

  return [
    `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`,
    "T",
    `${padDatePart(date.getHours())}${padDatePart(date.getMinutes())}${padDatePart(date.getSeconds())}`,
    "-",
    padDatePart(Math.floor(date.getMilliseconds() / 10)),
    offsetSign,
    padDatePart(offsetHours),
    ":",
    padDatePart(offsetRemainingMinutes),
  ].join("");
}

export function createTimestamp(date = new Date()): string {
  return formatLocalTimestamp(date);
}

export const createJson = {
  new<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  },
  stringify(value: unknown): string {
    return JSON.stringify(value, null, 2);
  },
};
