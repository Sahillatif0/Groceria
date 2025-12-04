const CAMEL_TO_SNAKE_REGEX = /([A-Z])/g;

export const camelToSnake = (value = "") =>
  value.replace(CAMEL_TO_SNAKE_REGEX, (match) => `_${match.toLowerCase()}`);

export const buildUpdateSet = (data = {}) => {
  const clauses = [];
  const values = [];

  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    clauses.push(`${camelToSnake(key)} = $${clauses.length + 1}`);
    values.push(value);
  });

  return { clauses, values };
};
