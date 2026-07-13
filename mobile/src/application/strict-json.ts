export interface StrictJsonScanLimits {
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxArrayLength: number;
  readonly maxStringLength: number;
}

function invalidJson(cause?: unknown): never {
  throw new Error("The selected file is not valid JSON.", cause === undefined ? undefined : { cause });
}

/**
 * Validate JSON grammar while retaining object-key identity long enough to
 * reject duplicates. JSON.parse alone cannot do that because it silently keeps
 * the final value, including for escaped-equivalent keys such as "a" and
 * "\\u0061".
 */
export function assertJsonHasUniqueObjectKeys(
  input: string,
  limits: StrictJsonScanLimits,
): void {
  let offset = 0;
  let nodes = 0;
  const numberPattern = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

  const skipWhitespace = (): void => {
    while (
      input[offset] === " "
      || input[offset] === "\n"
      || input[offset] === "\r"
      || input[offset] === "\t"
    ) {
      offset += 1;
    }
  };

  const readString = (): string => {
    if (input[offset] !== '"') invalidJson();
    const start = offset;
    offset += 1;
    while (offset < input.length) {
      const character = input[offset];
      if (character === '"') {
        offset += 1;
        let decoded: unknown;
        try {
          decoded = JSON.parse(input.slice(start, offset)) as unknown;
        } catch (error) {
          invalidJson(error);
        }
        if (typeof decoded !== "string") invalidJson();
        if (decoded.length > limits.maxStringLength) {
          throw new Error("Journal archive JSON contains an oversized string.");
        }
        return decoded;
      }
      if (character === "\\") {
        offset += 2;
        continue;
      }
      if (character === undefined || character.charCodeAt(0) < 0x20) invalidJson();
      offset += 1;
    }
    invalidJson();
  };

  const readLiteral = (literal: "true" | "false" | "null"): void => {
    if (!input.startsWith(literal, offset)) invalidJson();
    offset += literal.length;
  };

  const readValue = (depth: number): void => {
    nodes += 1;
    if (nodes > limits.maxNodes) {
      throw new Error("Journal archive JSON has too many values.");
    }
    if (depth > limits.maxDepth) {
      throw new Error("Journal archive JSON is nested too deeply.");
    }
    skipWhitespace();
    const token = input[offset];

    if (token === "{") {
      offset += 1;
      skipWhitespace();
      if (input[offset] === "}") {
        offset += 1;
        return;
      }
      const keys = new Set<string>();
      while (true) {
        const key = readString();
        if (keys.has(key)) {
          throw new Error(`Journal archive JSON contains duplicate object key ${JSON.stringify(key)}.`);
        }
        keys.add(key);
        skipWhitespace();
        if (input[offset] !== ":") invalidJson();
        offset += 1;
        readValue(depth + 1);
        skipWhitespace();
        const separator = input[offset];
        if (separator === "}") {
          offset += 1;
          return;
        }
        if (separator !== ",") invalidJson();
        offset += 1;
        skipWhitespace();
      }
    }

    if (token === "[") {
      offset += 1;
      skipWhitespace();
      if (input[offset] === "]") {
        offset += 1;
        return;
      }
      let length = 0;
      while (true) {
        length += 1;
        if (length > limits.maxArrayLength) {
          throw new Error("Journal archive JSON contains an oversized array.");
        }
        readValue(depth + 1);
        skipWhitespace();
        const separator = input[offset];
        if (separator === "]") {
          offset += 1;
          return;
        }
        if (separator !== ",") invalidJson();
        offset += 1;
      }
    }

    if (token === '"') {
      readString();
      return;
    }
    if (token === "t") {
      readLiteral("true");
      return;
    }
    if (token === "f") {
      readLiteral("false");
      return;
    }
    if (token === "n") {
      readLiteral("null");
      return;
    }

    numberPattern.lastIndex = offset;
    const number = numberPattern.exec(input);
    if (number === null) invalidJson();
    offset = numberPattern.lastIndex;
  };

  readValue(0);
  skipWhitespace();
  if (offset !== input.length) invalidJson();
}
