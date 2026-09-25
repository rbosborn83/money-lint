export interface Position {
  line: number;
  column: number;
}

export interface Finding {
  file: string;
  rule: string;
  severity: "error" | "warning";
  message: string;
  start: Position;
  end: Position;
}

interface AmountToken {
  raw: string;
  symbol?: string;
  amount: string;
  code?: string;
  startColumn: number;
  endColumn: number;
}

// Currencies a symbol is allowed to stand for. Deliberately narrow: these
// are the pairings you'd actually see in the wild, not every currency that
// technically uses the symbol somewhere.
const SYMBOL_CURRENCIES: Record<string, string[]> = {
  "$": ["USD", "CAD", "AUD", "NZD", "SGD", "HKD", "MXN", "TWD"],
  "€": ["EUR"],
  "£": ["GBP"],
  "¥": ["JPY", "CNY"],
};

const MONEY_IDENTIFIER =
  /price|amount|cost|total|fee|balance|salary|wage|payment|charge|subtotal|tax|discount|refund|invoice/i;

// An optional currency symbol, a number, and an optional trailing ISO 4217
// code. The symbol and code each own their adjoining whitespace so a bare
// number with no symbol/code never picks up a stray leading space in its
// match. The number itself is one of three shapes, tried in order: comma
// thousands grouping with an optional dot decimal (1,234.56, US-style),
// dot thousands grouping with an optional comma decimal (1.234,56,
// European-style), or a plain integer/decimal with no grouping at all.
const TOKEN_PATTERN =
  /(?:([$€£¥])\s?)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:\.\d+)?)(?:\s?([A-Z]{3})\b)?/g;

function findAmountTokens(line: string): AmountToken[] {
  const tokens: AmountToken[] = [];
  for (const match of line.matchAll(TOKEN_PATTERN)) {
    const [raw, symbol, amount, code] = match;
    const hasDecimal = amount.includes(".");
    if (!symbol && !code && !hasDecimal) {
      // A bare integer with no currency marker is too ambiguous to report
      // on and too common to be worth the noise (array indices, ports,
      // loop bounds, ...).
      continue;
    }
    const startColumn = (match.index ?? 0) + 1;
    tokens.push({
      raw,
      symbol,
      amount,
      code,
      startColumn,
      endColumn: startColumn + raw.length,
    });
  }
  return tokens;
}

function checkSymbolCodeMismatch(
  file: string,
  lineNumber: number,
  tokens: AmountToken[],
): Finding[] {
  const findings: Finding[] = [];
  for (const token of tokens) {
    if (!token.symbol || !token.code) continue;
    const expected = SYMBOL_CURRENCIES[token.symbol];
    if (expected && !expected.includes(token.code)) {
      findings.push({
        file,
        rule: "symbol-code-mismatch",
        severity: "error",
        message:
          `symbol '${token.symbol}' does not match currency code '${token.code}' ` +
          `(expected ${expected.join(", ")})`,
        start: { line: lineNumber, column: token.startColumn },
        end: { line: lineNumber, column: token.endColumn },
      });
    }
  }
  return findings;
}

// Matches the European grouping shape our second TOKEN_PATTERN alternative
// produces: one or more dot-separated groups of exactly three digits,
// optionally followed by a comma decimal part. Anything JS itself would
// parse as a number (plain decimals, comma-grouped US numbers) never
// reaches this far because the dot never appears as a group separator.
const DOT_GROUPED_SHAPE = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d+))?$/;

function checkAmbiguousSeparator(
  file: string,
  lineNumber: number,
  tokens: AmountToken[],
): Finding[] {
  const findings: Finding[] = [];
  for (const token of tokens) {
    // Only flag amounts we know are money — a symbol or ISO code attached.
    // Without one, a dot-grouped number is just as likely to be a version
    // string or an IP address, and reporting on it would be noise.
    if (!token.symbol && !token.code) continue;
    const match = DOT_GROUPED_SHAPE.exec(token.amount);
    if (!match) continue;
    const [, wholePart, decimalPart] = match;
    const amountOffset = token.raw.indexOf(token.amount);
    const startColumn = token.startColumn + amountOffset;
    const message = decimalPart
      ? `'${token.amount}' uses '.' as a thousands separator and ',' as the decimal point ` +
        `(European-style). A naive parse (Number(), parseFloat()) stops at the comma and reads ` +
        `${wholePart}, not the intended ${wholePart.replace(/\./g, "")}.${decimalPart}.`
      : `'${token.amount}' uses '.' as a thousands separator (European-style). A naive parse ` +
        `(Number(), parseFloat()) reads it as the decimal ${token.amount}, not the intended ` +
        `integer ${wholePart.replace(/\./g, "")}.`;
    findings.push({
      file,
      rule: "ambiguous-separator",
      severity: "warning",
      message,
      start: { line: lineNumber, column: startColumn },
      end: { line: lineNumber, column: startColumn + token.amount.length },
    });
  }
  return findings;
}

const MONEY_DECLARATION =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*number)?\s*=\s*(-?\d+\.\d{2,})\b/g;

function checkFloatLiteralMoney(
  file: string,
  lineNumber: number,
  line: string,
): Finding[] {
  const findings: Finding[] = [];
  for (const match of line.matchAll(MONEY_DECLARATION)) {
    const [whole, identifier, literal] = match;
    if (!MONEY_IDENTIFIER.test(identifier)) continue;
    const literalOffset = whole.lastIndexOf(literal);
    const startColumn = (match.index ?? 0) + literalOffset + 1;
    findings.push({
      file,
      rule: "float-literal-money",
      severity: "warning",
      message:
        `'${identifier}' looks like a money amount stored as a floating-point literal (${literal}). ` +
        "Floating-point arithmetic can silently lose precision (0.1 + 0.2 !== 0.3) — " +
        "store the amount as an integer count of the smallest unit (e.g. cents) instead.",
      start: { line: lineNumber, column: startColumn },
      end: { line: lineNumber, column: startColumn + literal.length },
    });
  }
  return findings;
}

export function lint(source: string, file: string): Finding[] {
  const findings: Finding[] = [];
  const lines = source.split(/\r\n|\r|\n/);
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const tokens = findAmountTokens(line);
    findings.push(...checkSymbolCodeMismatch(file, lineNumber, tokens));
    findings.push(...checkAmbiguousSeparator(file, lineNumber, tokens));
    findings.push(...checkFloatLiteralMoney(file, lineNumber, line));
  });
  return findings;
}

export function formatFinding(finding: Finding, source: string): string {
  const lines = source.split(/\r\n|\r|\n/);
  const lineText = lines[finding.start.line - 1] ?? "";
  const caretLength = Math.max(1, finding.end.column - finding.start.column);
  const caret =
    " ".repeat(finding.start.column - 1) + "^".repeat(caretLength);
  const location = `${finding.file}:${finding.start.line}:${finding.start.column}`;
  return [
    `${location} - ${finding.severity} - ${finding.message} [${finding.rule}]`,
    `  ${lineText}`,
    `  ${caret}`,
  ].join("\n");
}
