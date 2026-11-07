import unittest

from explain_10m import judge


def node(typ, rel=None, reads=0, kids=None):
    n = {"Node Type": typ, "Shared Read Blocks": reads}
    if rel:
        n["Relation Name"] = rel
    if kids:
        n["Plans"] = kids
    return n


class Judge(unittest.TestCase):
    def test_index_plan_passes(self):
        plan = {"Plan": node("Limit", kids=[node("Index Scan", "messages", 12)]), "Execution Time": 3.0}
        self.assertEqual(judge(plan, 50), [])

    def test_seq_scan_on_big_table_fails_even_when_fast(self):
        plan = {"Plan": node("Limit", kids=[node("Seq Scan", "users", 10)]), "Execution Time": 1.0}
        self.assertEqual(judge(plan, 50), ["Seq Scan on users"])

    def test_seq_scan_on_small_table_is_fine(self):
        plan = {"Plan": node("Seq Scan", "practice_areas"), "Execution Time": 1.0}
        self.assertEqual(judge(plan, 50), [])

    def test_slow_and_cold_fail(self):
        plan = {"Plan": node("Index Scan", "posts", 9000), "Execution Time": 120.0}
        self.assertEqual(len(judge(plan, 100)), 2)

    def test_partition_seq_scan_fails_by_actual_name(self):
        plan = {"Plan": node("Append", kids=[node("Seq Scan", "messages_h07")]), "Execution Time": 1.0}
        self.assertEqual(judge(plan, 50, {"messages", "messages_h07"}), ["Seq Scan on messages_h07"])

    def test_similarly_named_small_table_is_fine(self):
        plan = {"Plan": node("Seq Scan", "users_preferences"), "Execution Time": 1.0}
        self.assertEqual(judge(plan, 50, {"users", "users_h01"}), [])

    def test_reads_counted_on_leaves_only(self):
        # the parent repeats its children's blocks: 3000 + 3000 must not become 9000
        leaves = [node("Index Scan", "messages", 3000), node("Index Scan", "messages", 3000)]
        plan = {"Plan": node("Append", reads=6000, kids=leaves), "Execution Time": 1.0}
        self.assertEqual(judge(plan, 50), ["6000 blocks read from disk > 5000"])


if __name__ == "__main__":
    unittest.main()
