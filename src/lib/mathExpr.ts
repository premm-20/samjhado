// Tiny, safe expression compiler for plot steps: f(x) from text, no eval.
// Grammar: expr := term (('+'|'-') term)* ; term := unary (('*'|'/') unary | implicit)* ;
// unary := '-' unary | power ; power := atom ('^' unary)? ; atom := number | x | const | fn '(' expr ')' | '(' expr ')'

type Fn = (x: number) => number;

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
  log: Math.log,
  ln: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
  tanh: Math.tanh,
  sigmoid: (v) => 1 / (1 + Math.exp(-v)),
  relu: (v) => Math.max(0, v),
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export function compileExpr(src: string): Fn | null {
  const s = src.replace(/\*\*/g, "^").replace(/\s+/g, "").toLowerCase();
  if (!s || s.length > 200) return null;
  let i = 0;

  const peek = () => s[i];
  const eat = (c: string) => (s[i] === c ? (i++, true) : false);

  function atom(): Fn {
    if (eat("(")) {
      const e = expr();
      if (!eat(")")) throw new Error(")");
      return e;
    }
    const numM = /^\d*\.?\d+(e[+-]?\d+)?/.exec(s.slice(i));
    if (numM) {
      i += numM[0].length;
      const v = parseFloat(numM[0]);
      return () => v;
    }
    const idM = /^[a-z]+/.exec(s.slice(i));
    if (idM) {
      const id = idM[0];
      if (FUNCS[id] && s[i + id.length] === "(") {
        i += id.length;
        const f = FUNCS[id];
        const arg = atom();
        return (x) => f(arg(x));
      }
      if (id === "x") {
        i += 1;
        return (x) => x;
      }
      if (CONSTS[id] !== undefined) {
        i += id.length;
        const v = CONSTS[id];
        return () => v;
      }
      // things like "xe" or "2x": consume a single x/const char-wise
      if (id[0] === "x") {
        i += 1;
        return (x) => x;
      }
      throw new Error(`unknown ${id}`);
    }
    throw new Error(`unexpected ${peek()}`);
  }

  function power(): Fn {
    const base = atom();
    if (eat("^")) {
      const ex = unary();
      return (x) => Math.pow(base(x), ex(x));
    }
    return base;
  }

  function unary(): Fn {
    if (eat("-")) {
      const u = unary();
      return (x) => -u(x);
    }
    if (eat("+")) return unary();
    return power();
  }

  function term(): Fn {
    let left = unary();
    for (;;) {
      if (eat("*")) {
        const r = unary();
        const l = left;
        left = (x) => l(x) * r(x);
      } else if (eat("/")) {
        const r = unary();
        const l = left;
        left = (x) => l(x) / r(x);
      } else if (peek() && /[a-z(0-9.]/.test(peek()!)) {
        // implicit multiplication: 2x, 3(x+1), x(x-1)
        const r = unary();
        const l = left;
        left = (x) => l(x) * r(x);
      } else return left;
    }
  }

  function expr(): Fn {
    let left = term();
    for (;;) {
      if (eat("+")) {
        const r = term();
        const l = left;
        left = (x) => l(x) + r(x);
      } else if (eat("-")) {
        const r = term();
        const l = left;
        left = (x) => l(x) - r(x);
      } else return left;
    }
  }

  try {
    const f = expr();
    if (i !== s.length) return null;
    // must produce a finite value somewhere in a typical range
    const ok = [-2, -1, 0, 0.5, 1, 2].some((v) => Number.isFinite(f(v)));
    return ok ? f : null;
  } catch {
    return null;
  }
}
