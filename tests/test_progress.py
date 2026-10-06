import importlib.util,json,sqlite3,unittest,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('studio',ROOT/'local-app/server.py')
studio=importlib.util.module_from_spec(spec);spec.loader.exec_module(studio)

class ProgressTests(unittest.TestCase):
    def setUp(self):
        self.db=Path(__file__).parent/f'.test-{uuid.uuid4().hex}.sqlite3'
        studio.initialize(self.db)
    def tearDown(self):
        self.db.unlink(missing_ok=True)
    def test_complete_four_month_plan(self):
        self.assertEqual(len(studio.PLAN['topics']),150)
        self.assertEqual(len(studio.PLAN['modules']),29)
        self.assertEqual(len(studio.PLAN['tasks']),789)
        dates=sorted({t['date'] for t in studio.PLAN['tasks']})
        self.assertEqual((len(dates),dates[0],dates[-1]),(123,'2026-10-06','2027-02-05'))
    def test_progress_survives_new_database_connection(self):
        value={'done':True,'hours':1.25,'notes':'Review eigenvalues'}
        studio.write_progress({'id':'task-0001','value':value},self.db)
        self.assertEqual(studio.read_progress(self.db)['task-0001'],value)
    def test_untick_and_zero_hours(self):
        studio.write_progress({'id':'task-0001','value':{'done':True,'hours':2}},self.db)
        studio.write_progress({'id':'task-0001','value':{'done':False,'hours':0}},self.db)
        self.assertEqual(studio.read_progress(self.db)['task-0001'],{'done':False,'hours':0})
    def test_ticks_do_not_invent_hours(self):
        studio.write_progress({'id':'task-0001','value':{'done':True}},self.db)
        self.assertNotIn('hours',studio.read_progress(self.db)['task-0001'])
    def test_rejects_invalid_hours_and_wrong_fields(self):
        for value in [{'hours':-1},{'hours':25},{'hours':True},{'hours':float('nan')},{'lesson':True},{'notes':'a'*2001}]:
            with self.subTest(value=value),self.assertRaises(ValueError):
                studio.write_progress({'id':'task-0001','value':value},self.db)
        self.assertEqual(studio.read_progress(self.db),{})
    def test_all_syllabus_stages(self):
        value=dict.fromkeys(['lesson','practice','pyqs','revision'],True)
        studio.write_progress({'id':'topic-001','value':value},self.db)
        self.assertEqual(studio.read_progress(self.db)['topic-001'],value)
    def test_cloud_schema_separates_users(self):
        connection=sqlite3.connect(':memory:')
        try:
            connection.executescript((ROOT/'drizzle/0000_short_norrin_radd.sql').read_text())
            for user,hours in [('a',1),('b',2)]:
                connection.execute('INSERT INTO study_progress VALUES (?,?,?,?,?)',(user,'task-0001','task',json.dumps({'hours':hours}),'now'))
            rows=connection.execute('SELECT payload FROM study_progress WHERE user_id=?',('a',)).fetchall()
            self.assertEqual(rows,[(json.dumps({'hours':1}),)])
        finally:connection.close()

if __name__=='__main__':unittest.main()
