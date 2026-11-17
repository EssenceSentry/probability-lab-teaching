// Each displayed row is an exact slice of the original expression.
export type ExpressionLine = { start: number; indent: number; text: string }
type Token = { text: string; start: number; end: number; body?: Token[]; expand?: boolean }

type Group = Token & { body: Token[] }

const lexeme =
  /#[^\n]*|"""|'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?|[\p{ID_Start}_][\p{ID_Continue}]*|\*\*|\/\/|<<|>>|:=|==|!=|<=|>=|[^\s]/gu
const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" }

function tokenize(source: string) {
  const root: Token[] = []
  const groups: Group[] = []
  for (const match of source.matchAll(lexeme)) {
    const text = match[0]
    // Keep comments, incomplete input and multiline literals in their authored layout.
    if (text.startsWith("#") || /^("""|'''|"$|'$)/.test(text)) return
    if (")]}".includes(text)) {
      const group = groups.pop()
      if (!group || pairs[group.text] !== text) return
      group.end = match.index + 1
      const body = group.body
      const siblings = groups.at(-1)?.body ?? root
      const call = group.text === "(" && operand(siblings.at(-2))
      const args = call ? argsOf(body) : []
      group.expand =
        body.some((t) => t.expand) || args.length >= 3 || args.some((arg) => size(arg) >= 22)
      continue
    }
    const token: Token = { text, start: match.index, end: match.index + text.length }
    const siblings = groups.at(-1)?.body ?? root
    if (Object.hasOwn(pairs, text)) {
      if (groups.length >= 64) return
      const group: Group = { ...token, body: [] }
      siblings.push(group)
      groups.push(group)
    } else {
      siblings.push(token)
    }
  }
  if (!groups.length) return root
}

function size(tokens: Token[]) {
  return tokens.length ? tokens[tokens.length - 1].end - tokens[0].start : 0
}

function argsOf(tokens: Token[]) {
  // Commas can bind names within a comprehension or a lambda signature.
  if (tokens.some((t) => t.text === "for" || t.text === "lambda")) return [tokens]
  const args: Token[][] = []
  let start = 0
  for (const [i, token] of tokens.entries()) {
    if (token.text !== ",") continue
    if (i > start) args.push(tokens.slice(start, i))
    start = i + 1
  }
  if (start < tokens.length) args.push(tokens.slice(start))
  return args
}

const precedence = [
  ["for", "if", "else"],
  ["or"],
  ["and"],
  ["==", "!=", "<", "<=", ">", ">="],
  ["|"],
  ["^"],
  ["&"],
  ["<<", ">>"],
  ["+", "-"],
  ["*", "@", "/", "//", "%"],
]

function operand(token: Token | undefined) {
  return (
    token &&
    (token.body || /^[\p{ID_Continue}.'"]/u.test(token.text)) &&
    !["and", "or", "not", "if", "else", "in", "is", "for", "lambda"].includes(token.text)
  )
}

function formatLine(source: string, width: number): ExpressionLine[] {
  const cuts = new Map([[0, 0]])
  const tokens = tokenize(source)
  function visit(part: Token[], indent: number, suffix = 0) {
    if (!part.length) return
    const over = indent + size(part) + suffix > width
    if (over) {
      // Break the weakest outer operation first. Keep unary signs and dotted names intact.
      const split = (at: number[]) => {
        if (!at.length) return false
        visit(part.slice(0, at[0]), indent)
        at.forEach((i, k) => {
          cuts.set(part[i].start, indent + 2)
          visit(part.slice(i, at[k + 1]), indent + 2, k === at.length - 1 ? suffix : 0)
        })
        return true
      }
      for (const ops of precedence) {
        if (
          split(part.flatMap((t, i) => (ops.includes(t.text) && operand(part[i - 1]) ? [i] : [])))
        )
          return
      }
      if (split(part.flatMap((t, i) => (t.text === "." && part[i - 1]?.body ? [i] : [])))) return
    }

    const groups = part.filter((t): t is Group => Boolean(t.body?.length))
    const widest = over
      ? groups.reduce<Group | undefined>(
          (best, t) => (!best || size(t.body) > size(best.body) ? t : best),
          undefined
        )
      : undefined
    for (const group of groups) {
      if (group !== widest && !group.expand) continue
      const body = group.body
      const leading = part[0].text
      const base = indent + (["=", "~", "+", "-", "*", "/", "@"].includes(leading) ? 2 : 0)
      const inside = base + 2
      const rows = group.text === "[" && inside + size(body) <= width ? [body] : argsOf(body)
      for (const row of rows) {
        cuts.set(row[0].start, inside)
        const comma = row !== rows.at(-1) || body.at(-1)?.text === ","
        visit(row, inside, comma ? 1 : 0)
      }
      cuts.set(group.end - 1, base)
    }
  }
  if (tokens) visit(tokens, 0)
  const breaks = [...cuts.entries()].sort(([a], [b]) => a - b)
  return breaks.map(([start, indent], i) => ({
    start,
    indent,
    text: source.slice(start, breaks[i + 1]?.[0]),
  }))
}

export function expressionLines(source: string, width: number): ExpressionLine[] {
  // Saved introductory descriptions and preformatted Python blocks retain their own line breaks.
  let offset = 0
  return source.split(/(?<=\n)/).flatMap((line) => {
    const code =
      /^(?:[=~]\s|obs\s*=|[\p{ID_Start}_][\p{ID_Continue}.]*(?=\s*[[()+*/@%<>&|^-]|\s+(?:and|or)\b))/u.test(
        line
      )
    const rows = code ? formatLine(line, width) : [{ start: 0, indent: 0, text: line }]
    const start = offset
    offset += line.length
    return rows.map((row) => ({ ...row, start: start + row.start }))
  })
}
