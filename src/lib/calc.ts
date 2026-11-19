/**
 * Expression evaluator for the exam calculator. A small tokenizer plus a
 * precedence-climbing parser: no `eval` (the site's Content-Security-Policy
 * forbids it anyway) and nothing outside this grammar can run.
 *
 *   numbers 1, 2.5, .5, 1e-3     operators + - * / ^ %(mod) !(factorial)
 *   parentheses, implicit multiply (2pi, 3(4), 2sqrt(9))
 *   functions sin cos tan asin acos atan sinh cosh tanh ln log log2 sqrt cbrt abs exp floor ceil round
 *   constants pi, e, ans
 */

export type AngleMode = "deg" | "rad";

type Tok =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "(" }
  | { t: ")" };

const FUNCS = new Set([
  "sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh",
  "ln", "log", "log2", "sqrt", "cbrt", "abs", "exp", "floor", "ceil", "round",
]);

export class CalcError extends Error {}

function tokenize(src: string): Tok[] {
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/π/g, "pi").replace(/√/g, "sqrt");
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " ") { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
      if (!m) throw new CalcError("Bad number");
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-z]/i.test(c)) {
      // Letters only, so "sqrt16" reads as sqrt 16. "log2(" is the one name with a digit.
      let name = /^[a-z]+/i.exec(s.slice(i))![0].toLowerCase();
      if (name === "log" && s.slice(i + 3, i + 5) === "2(") name = "log2";
      out.push({ t: "id", v: name });
      i += name.length;
      continue;
    }
    if ("+-*/^%!".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    if (c === "(") { out.push({ t: "(" }); i++; continue; }
    if (c === ")") { out.push({ t: ")" }); i++; continue; }
    throw new CalcError(`Unexpected "${c}"`);
  }
  return out;
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new CalcError("Factorial needs a whole number ≥ 0");
  if (n > 170) return Infinity;
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

export function evaluate(input: string, opts: { mode?: AngleMode; ans?: number } = {}): number {
  const mode = opts.mode ?? "deg";
  const toRad = (x: number) => (mode === "deg" ? (x * Math.PI) / 180 : x);
  const fromRad = (x: number) => (mode === "deg" ? (x * 180) / Math.PI : x);
  const toks = tokenize(input);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const k = peek(); return !!k && k.t === "op" && k.v === v; };
  /** A token that can start an operand: used to detect implicit multiplication. */
  const startsOperand = () => { const k = peek(); return !!k && (k.t === "num" || k.t === "id" || k.t === "("); };

  function applyFn(name: string, x: number): number {
    switch (name) {
      case "sin": return Math.sin(toRad(x));
      case "cos": return Math.cos(toRad(x));
      case "tan": return Math.tan(toRad(x));
      case "asin": return fromRad(Math.asin(x));
      case "acos": return fromRad(Math.acos(x));
      case "atan": return fromRad(Math.atan(x));
      case "sinh": return Math.sinh(x);
      case "cosh": return Math.cosh(x);
      case "tanh": return Math.tanh(x);
      case "ln": return Math.log(x);
      case "log": return Math.log10(x);
      case "log2": return Math.log2(x);
      case "sqrt": return Math.sqrt(x);
      case "cbrt": return Math.cbrt(x);
      case "abs": return Math.abs(x);
      case "exp": return Math.exp(x);
      case "floor": return Math.floor(x);
      case "ceil": return Math.ceil(x);
      case "round": return Math.round(x);
    }
    throw new CalcError(`Unknown function ${name}`);
  }

  // primary := number | constant | func primary | "(" expr ")"
  function primary(): number {
    const k = peek();
    if (!k) throw new CalcError("Incomplete expression");
    if (k.t === "num") { p++; return k.v; }
    if (k.t === "(") {
      p++;
      const v = expr();
      if (peek()?.t !== ")") throw new CalcError("Missing )");
      p++;
      return v;
    }
    if (k.t === "id") {
      p++;
      if (k.v === "pi") return Math.PI;
      if (k.v === "e") return Math.E;
      if (k.v === "ans") return opts.ans ?? 0;
      if (FUNCS.has(k.v)) return applyFn(k.v, unary());
      throw new CalcError(`Unknown name ${k.v}`);
    }
    throw new CalcError("Unexpected symbol");
  }

  // postfix := primary "!"*
  function postfix(): number {
    let v = primary();
    while (isOp("!")) { p++; v = factorial(v); }
    return v;
  }

  // power := postfix ("^" unary)?   (right associative; -2^2 = -4, 2^-1 = 0.5)
  function power(): number {
    const base = postfix();
    if (isOp("^")) { p++; return Math.pow(base, unary()); }
    return base;
  }

  // unary := ("-"|"+") unary | power
  function unary(): number {
    if (isOp("-")) { p++; return -unary(); }
    if (isOp("+")) { p++; return unary(); }
    return power();
  }

  // term := unary (("*"|"/"|"%") unary | implicit unary)*
  function term(): number {
    let v = unary();
    for (;;) {
      if (isOp("*")) { p++; v *= unary(); }
      else if (isOp("/")) { p++; v /= unary(); }
      else if (isOp("%")) { p++; const d = unary(); v = ((v % d) + d) % d; }
      else if (startsOperand()) v *= power();
      else return v;
    }
  }

  function expr(): number {
    let v = term();
    for (;;) {
      if (isOp("+")) { p++; v += term(); }
      else if (isOp("-")) { p++; v -= term(); }
      else return v;
    }
  }

  if (toks.length === 0) throw new CalcError("Empty");
  const value = expr();
  if (p < toks.length) throw new CalcError("Unexpected symbol");
  return value;
}

/** Display a result without floating-point noise (0.1+0.2 → 0.3). */
export function formatResult(v: number): string {
  if (Number.isNaN(v)) return "Error";
  if (!Number.isFinite(v)) return v > 0 ? "∞" : "-∞";
  if (v !== 0 && (Math.abs(v) >= 1e12 || Math.abs(v) < 1e-9)) return v.toExponential(8).replace(/\.?0+e/, "e");
  return String(Number(v.toPrecision(12)));
}
