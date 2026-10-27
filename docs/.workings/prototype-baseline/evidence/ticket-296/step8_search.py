# Step 8 searches over the documented scope: English and Chinese terms; binaries listed and skipped by a NUL test.
# Writes the evidence with every Han character as \x{hex}, and prints the raw Chinese hits to stderr for reading.
import re, subprocess, sys
scope = "docs/specs docs/features docs/adr docs/ops docs/agents docs/prototypes docs/postmortems CONTEXT.md AGENTS.md CLAUDE.md README.md README.en.md site/README.md .github capabilities.toml package.json".split()
files = subprocess.run(["git", "ls-files", "--"] + scope, capture_output=True, text=True, check=True).stdout.split("\n")
files = [f for f in files if f]
EN = re.compile(r"check-lang|check:lang|working-language gate|language gate|SKILL_TOOLING|verbatim|copied (in|from)|skill's (template|copies|copy)|tooling|gallery shell.*(exempt|check|copy)|mockup.*exempt|exempt.*(prototype|mockup)", re.I)
cp = lambda *xs: "".join(chr(x) for x in xs)
ZH_TERMS = {"gate": cp(0x95e8, 0x7981), "verbatim": cp(0x539f, 0x6837), "copy instance": cp(0x526f, 0x672c), "tooling": cp(0x5de5, 0x88c5), "exemption": cp(0x8c41, 0x514d), "marker": cp(0x6807, 0x8bb0)}
TEMPLATE, COPY = cp(0x6a21, 0x677f), cp(0x590d, 0x5236)
HAN = re.compile("[" + cp(0x4e00) + "-" + cp(0x9fff) + "]")
# Escape every character from U+2E80 up (CJK radicals, punctuation, ideographs, fullwidth forms): the language gate
# counts CJK punctuation and fullwidth forms as Chinese too, not only the ideographs
WIDE = re.compile("[" + cp(0x2e80) + "-" + cp(0xffff) + "]")
esc = lambda s: WIDE.sub(lambda m: "\\x{%x}" % ord(m.group()), s)
binaries, texts, han, latin = [], [], 0, 0
out = []
for f in files:
    b = open(f, "rb").read()
    if b"\0" in b: binaries.append(f); continue
    t = b.decode("utf-8", "replace"); texts.append(f)
    han += bool(HAN.search(t)); latin += bool(re.search("[A-Za-z]", t))
out.append(f"Scope: {' '.join(scope)} -- {len(files)} tracked files; {len(binaries)} binary (a NUL byte), skipped: {', '.join(binaries)}")
out.append(f"Text files read: {len(texts)}; with Han: {han}; with Latin: {latin}")
en_hits, zh_hits = [], []
for f in texts:
    for i, line in enumerate(open(f, encoding="utf-8", errors="replace").read().split("\n"), 1):
        if EN.search(line): en_hits.append(f"{f}:{i}: {line.strip()[:220]}")
        names = [k for k, w in ZH_TERMS.items() if w in line] + (["template with copy"] if TEMPLATE in line and COPY in line else [])
        if names: zh_hits.append((f, i, names, line.strip()[:160]))
out.append(""); out.append(f"## English, case-insensitive: {EN.pattern}"); out += en_hits; out.append(f"({len(en_hits)} lines)")
out.append(""); out.append("## Chinese, by code point: " + "; ".join(f"{k} " + esc(w) for k, w in ZH_TERMS.items()) + "; template " + esc(TEMPLATE) + " with copy " + esc(COPY))
out += [f"{f}:{i} [{', '.join(n)}]: {esc(l)}" for f, i, n, l in zh_hits]; out.append(f"({len(zh_hits)} lines)")
open(sys.argv[1], "w", encoding="utf-8").write("\n".join(out) + "\n")
for f, i, n, l in zh_hits: print(f"{f}:{i} [{', '.join(n)}]: {l}", file=sys.stderr)
