const prefixOrV1TokenPattern = /[\p{L}\p{N}_]+/gu;

export function tokenizePrefixOrV1Text(text: string): readonly string[] {
  return text.match(prefixOrV1TokenPattern) ?? [];
}

export function hasPrefixOrV1Token(text: string): boolean {
  return tokenizePrefixOrV1Text(text).length > 0;
}
