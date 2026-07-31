export function titleCaseItalian(value: string) {
  return value.trim().replace(/\s+/g, " ").split(" ").map((word) => word ? word[0].toLocaleUpperCase("it") + word.slice(1) : word).join(" ");
}
