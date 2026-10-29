#!/usr/bin/env python3
"""Lease contention check of a k6/staff.js run: no item in two hands at once.
   lease_check.py <k6.log>"""
import re, sys, collections
by = collections.defaultdict(list)
n = 0
for line in open(sys.argv[1]):
    m = re.search(r'LEASE (\S+) (\S+) (\d+) (\d+) (\d+)', line)
    if m:
        kind, item, vu, t0, t1 = m.groups()
        by[(kind, item)].append((int(t0), int(t1), int(vu)))
        n += 1
overlaps = 0
for k, iv in by.items():
    iv.sort()
    for a, b in zip(iv, iv[1:]):
        if b[0] < a[1] and b[2] != a[2]:
            overlaps += 1
            print('OVERLAP', k, a, b)
again = sum(len(v) - 1 for v in by.values() if len(v) > 1)
print(f'leases {n}, distinct items {len(by)}, taken again after done {again}, overlapping holders {overlaps}')
