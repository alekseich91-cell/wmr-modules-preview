"""Render the real module page from an immutable WMR commit, without a database.

Run with a Python environment containing Django:
  python scripts/sync-source.py --source /path/to/WMR --commit <sha>
The source checkout is read-only. Only allowlisted files are read from Git;
only rendered markup, module metadata, relevant CSS and hashes are published.
"""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import re
import runpy
import subprocess
import tempfile

from django.conf import settings
from django.template import Context, Engine

FILES = [
    'core/modules.py', 'accounts/models.py', 'core/warehouse_input.py',
    'core/views_settings.py', 'core/module_guards.py',
    'templates/core/settings_tabs/_modules.html',
    'templates/core/settings_tabs/_nav.html',
    'templates/core/includes/_module_option.html',
    'templates/core/includes/_settings_search.html',
    'templates/core/includes/_settings_search_empty.html',
    'static/css/base.css', 'static/js/settings_modules.js',
]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--commit', default='HEAD')
parser.add_argument('--stand-commit', default='')
args = parser.parse_args()
site = Path(__file__).resolve().parent.parent
policy = json.loads((site / 'pricing-policy.json').read_text())
sha = subprocess.check_output(['git', '-C', str(args.source), 'rev-parse', args.commit], text=True).strip()
raw = {name: subprocess.check_output(['git', '-C', str(args.source), 'show', f'{sha}:{name}']) for name in FILES}
with tempfile.TemporaryDirectory(prefix='wmr-pricing-source-') as temporary:
    root = Path(temporary)
    for name, data in raw.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    source = runpy.run_path(str(root / 'core/modules.py'))
    choice_sets = {}
    for node in ast.walk(ast.parse(raw['accounts/models.py'].decode())):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in ('TIMEZONE_CHOICES', 'DIMENSION_UNIT_CHOICES'):
                    choice_sets[target.id] = ast.literal_eval(node.value)
    modules = []
    for code, meta in source['MODULE_REGISTRY'].items():
        if code not in policy['prices']:
            raise ValueError(f'Price decision missing for new module: {code}')
        module = {key: meta[key] for key in ('label', 'description', 'group', 'category', 'icon')}
        module.update(id=code, price=policy['prices'][code], core=meta['category'] == 'core',
                      custom=code == 'multiwarehouse', options=[], note=policy['notes'].get(code, ''),
                      off_description=meta.get('off_description', ''))
        for original in meta.get('sub_options', []):
            if original['key'] == 'scanner_mode_enabled':
                continue  # Current warehouse contract v1 renders the mode selector.
            option = {key: original[key] for key in ('key', 'label', 'type', 'desc', 'details', 'min', 'max', 'choices', 'default', 'source', 'section', 'hidden') if key in original}
            option['price'] = policy['optionPrices'].get(option['key'], 0)
            if original.get('choices_attr') in choice_sets:
                option['choices'] = choice_sets[original['choices_attr']]
            if option['key'] == 'warehouse_input_mode':
                option['choices'] = [('manual', 'Ручной'), ('scanner', 'Сканер'), ('hybrid', 'Гибридный')]
                option['choicePrices'] = policy['modePrices']
            if option['type'] == 'multi':
                option['choicePrices'] = {value: 0 for value, _ in option['choices']}
            module['options'].append(option)
        modules.append(module)
    mobile = {'id': 'mobile', 'label': 'Мобильная версия', 'description': 'Доступ с телефона и видимость вкладок. Включение вкладки не выдаёт сотруднику права на её содержимое.',
              'group': 'mobile', 'category': 'optional', 'icon': 'bi-phone', 'price': 0, 'core': False, 'custom': False,
              'note': policy['notes']['mobile'], 'off_description': '', 'options': []}
    for code, label in [('calendar', 'Календарь'), ('schedule', 'Расписание'), ('cabinet', 'Кабинет'), ('accounting', 'Бухгалтерия'), ('warehouse', 'Склад'), ('catalog', 'Каталог'), ('availability', 'Проверка наличия')]:
        mobile['options'].append({'key': 'mobile_tab_' + code, 'label': label, 'type': 'bool', 'price': 0})
    mobile['options'].append({'key': 'mobile_availability_create', 'label': 'Создание проекта из корзины «Проверка наличия»', 'type': 'bool', 'price': 0})
    modules.append(mobile)
    catalog = {'version': policy['version'], 'base': 0, 'full': policy['full'], 'coreTotal': policy['coreTotal'],
               'sourceCommit': sha, 'groups': source['MODULE_GROUPS'] + [('mobile', 'Мобильная версия')], 'modules': modules}
    total = sum(m['price'] for m in modules) + sum(o['price'] for m in modules for o in m['options']) + max(policy['modePrices'].values())
    assert total == policy['full'], (total, policy['full'])
    assert sum(m['price'] for m in modules if m['core']) == policy['coreTotal']
    (site / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    groups = []
    for group_code, group_label in source['MODULE_GROUPS']:
        entries = []
        for module in modules:
            if module['group'] != group_code:
                continue
            meta = source['MODULE_REGISTRY'][module['id']]
            option_groups = {}
            options = []
            for option in module['options']:
                original = next(o for o in meta.get('sub_options', []) if o['key'] == option['key'])
                opt = {**original, **option, 'value': True, 'selected': [v for v, _ in option.get('choices', [])],
                       'html_id': f"{'core_' + module['id'] if module['core'] else 'sopt'}_{option['key']}"}
                if opt['type'] == 'select':
                    opt['value'] = opt['choices'][0][0]
                if opt['type'] == 'int':
                    opt['value'] = opt['min']
                options.append(opt)
                option_groups.setdefault(opt.get('section', ''), []).append(opt)
            entries.append({**meta, 'code': module['id'], 'is_core': module['core'], 'enabled': True,
                            'sub_options': options, 'option_groups': [{'label': label, 'options': opts} for label, opts in option_groups.items()]})
        entries.sort(key=lambda m: not m['is_core'])
        if entries:
            groups.append({'group_code': group_code, 'group_label': group_label, 'modules': entries})
    settings.configure(USE_I18N=False, USE_TZ=False)
    engine = Engine(dirs=[str(root / 'templates')])
    template = raw['templates/core/settings_tabs/_modules.html'].decode().split('</form>', 1)[0] + '</form>'
    template = template.replace('{% load static %}', '').replace('{% csrf_token %}', '')
    template = re.sub(r'{% url [^%]*%}', '', template)
    context = {'modules_ctx': groups, 'modules_readonly': False, 'mobile_ui': {'enabled': True, 'availability_create': True},
               'mobile_tabs': [{'code': o['key'].removeprefix('mobile_tab_'), 'label': o['label'], 'value': True} for o in mobile['options'] if o['key'].startswith('mobile_tab_')]}
    html = engine.from_string(template).render(Context(context))
    html = re.sub(r'<!--.*?-->', '', html, flags=re.S)
    (site / 'modules-original.html').write_text('\n'.join(line.rstrip() for line in html.splitlines()).strip() + '\n')
    nav = re.sub(r'{% url [^%]*%}', '#', raw['templates/core/settings_tabs/_nav.html'].decode())
    nav = engine.from_string(nav).render(Context({'can_manage_settings': True, 'can_manage_users': True, 'can_manage_pdf_templates': True, 'company_modules': [m['id'] for m in modules], 'active': 'modules', 'APP_VERSION': '5.176.1 · прототип v4'}))
    nav = re.sub(r'href="[^"]*"', 'href="#workspace"', nav)
    document = (site / 'index.html').read_text()
    a = document.index('    <div class="original-settings-nav">')
    b = document.index('    <div class="intro">', a)
    document = document[:a] + '    <div class="original-settings-nav">' + nav + '<button id="theme-toggle" class="btn btn-sm btn-outline-secondary" aria-label="Переключить светлую и тёмную тему"><i class="bi bi-moon"></i></button></div>\n' + document[b:]
    (site / 'index.html').write_text('\n'.join(line.rstrip() for line in document.splitlines()).rstrip() + '\n')
    css = raw['static/css/base.css'].decode()
    (site / 'source-modules.css').write_text('/* Module styles from the referenced WMR commit. */\n' + css[css.index('.modules-intro{'):].rstrip() + '\n')
    provenance = {'source_commit': sha, 'source_branch': subprocess.check_output(['git', '-C', str(args.source), 'branch', '--show-current'], text=True).strip(),
                  'stand_commit_at_sync': args.stand_commit, 'pricing_version': policy['version'],
                  'templates': {name: hashlib.sha256(data).hexdigest() for name, data in raw.items()},
                  'rendering': 'Original module and navigation templates rendered offline from the pinned branch commit. No production settings, database data or credentials are copied.',
                  'core_cards': [m['id'] for m in modules if m['core']],
                  'payroll': 'Timesheet, rate agreement and amount-edit restrictions are independent compatible switches.',
                  'pricing': '10,000 core + 36,000 optional modules + 4,000 advanced tools/mode = 50,000. Source behavior and proposed commercial prices are distinct.'}
    (site / 'source-reference.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'source': sha, 'cards': len(modules), 'options': sum(len(m['options']) for m in modules), 'core': provenance['core_cards'], 'full': total}, ensure_ascii=False))
