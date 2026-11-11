function digitsOf(text) {
  const value = String(text ?? '');
  return /^\d+$/.test(value) ? [...value].map(Number) : null;
}

export function luhnValid(text) {
  const digits = digitsOf(text);
  if (!digits || digits.length < 2) return false;
  let sum = 0;
  digits.reverse().forEach((digit, index) => {
    const doubled = index % 2 === 1 ? digit * 2 : digit;
    sum += doubled > 9 ? doubled - 9 : doubled;
  });
  return sum % 10 === 0;
}

export function weightedSum(text, weights) {
  const digits = digitsOf(text);
  if (!digits || !Array.isArray(weights) || weights.length !== digits.length || !weights.every(Number.isInteger)) return null;
  return digits.reduce((sum, digit, index) => sum + digit * weights[index], 0);
}

export function weightedRemainder(text, weights, modulus) {
  const sum = weightedSum(text, weights);
  if (sum === null || !Number.isInteger(modulus) || modulus < 2) return null;
  return ((sum % modulus) + modulus) % modulus;
}
