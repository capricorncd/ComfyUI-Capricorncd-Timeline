import ast
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
tree = ast.parse((ROOT / 'backend/cap_data_json_parser.py').read_text(encoding='utf-8-sig'))
node = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'CAP_DataJsonClipParser')
contract = {n.targets[0].id: ast.literal_eval(n.value) for n in node.body
            if isinstance(n, ast.Assign) and n.targets[0].id in ('RETURN_NAMES', 'RETURN_TYPES')}
execute = next(n for n in node.body if isinstance(n, ast.FunctionDef) and n.name == 'execute')


class ParserModelOutputTests(unittest.TestCase):
    def test_name_position_and_type(self):
        self.assertEqual(len(contract['RETURN_NAMES']), 20)
        self.assertEqual(contract['RETURN_NAMES'][11:14], ('clip_role', 'model_type', 'detailed_description'))
        self.assertEqual(contract['RETURN_TYPES'][12], 'STRING')
        returned = next(n for n in ast.walk(execute) if isinstance(n, ast.Return))
        self.assertEqual(returned.value.elts[12].id, 'model_type')
        for language in ('en', 'zh', 'ja'):
            locale = json.loads((ROOT / 'locales' / language / 'nodeDefs.json').read_text(encoding='utf-8-sig'))
            outputs = locale['CAP_DataJsonClipParser']['outputs']
            self.assertIn('model_type', outputs)
            self.assertNotIn('model', outputs)
            self.assertNotIn('agent', outputs)

    def test_existing_project_values_and_default(self):
        assignment = next(n for n in ast.walk(execute) if isinstance(n, ast.Assign)
                          and isinstance(n.targets[0], ast.Name) and n.targets[0].id == 'model_type')
        expression = compile(ast.Expression(assignment.value), '<model output>', 'eval')
        for raw, expected in [('MiniMaxH3', 'MiniMaxH3'), ('LTX', 'LTX'), (' Wan ', 'Wan'), ('', 'MiniMaxH3'), (None, 'MiniMaxH3')]:
            self.assertEqual(eval(expression, {'clip': {'agent': raw}}), expected)


if __name__ == '__main__':
    unittest.main()
