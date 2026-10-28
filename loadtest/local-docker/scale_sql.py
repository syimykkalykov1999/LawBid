#!/usr/bin/env python3
"""Scale the repo's deterministic load generators (scripts/ops/admin-load-gen.sql,
scripts/ops/user-load-gen.sql) by an integer factor S.

The generators are written for 100 000 users. Every row count and every
"modulo the population" constant is multiplied by S, everything else
(prices, 40 practice areas, 45 states, text variety, the 1 200 / 400 / 300
fixtures of loadtest-extra.sql) stays. S=10 -> 1 000 000 users, S=100 -> 10 M.

  scale_sql.py S in.sql > out.sql
"""
import re, sys

SCALED = {10000, 30000, 50000, 90000, 9000, 100000, 150000, 200000, 300000,
          500000, 600000, 1000000}

def main():
    s = int(sys.argv[1])
    src = open(sys.argv[2]).read()
    def rep(m):
        n = int(m.group(0))
        return str(n * s) if n in SCALED else m.group(0)
    out = re.sub(r'(?<![\w.])\d+(?![\w.])', rep, src)
    sys.stdout.write(f"-- scaled x{s} by ~/loadtest/seed/scale_sql.py from the repo generator\n" + out)

if __name__ == '__main__':
    main()
