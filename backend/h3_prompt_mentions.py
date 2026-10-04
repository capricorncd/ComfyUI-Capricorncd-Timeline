"""Resolve editor asset names against the references actually loaded for H3."""
import re
from pathlib import Path
from .prompt_text import strip_comment_lines


def asset_name(row):
    return str(row.get('name') or str(row.get('file') or '').replace('\\', '/').rsplit('/', 1)[-1]).strip()


def compile_h3_mentions(prompt, references):
    aliases = {}
    for row, tag in references:
        name = asset_name(row)
        if name:
            aliases.setdefault(name, set()).add(tag)
    if not aliases or '@' not in prompt:
        return prompt
    pattern = re.compile(r'(?<![A-Za-z0-9_@])@(' + '|'.join(re.escape(name) for name in sorted(aliases, key=len, reverse=True)) + r')(?![\w])')
    def replace(match):
        tags = aliases[match[1]]
        if len(tags) != 1:
            raise ValueError(f'Ambiguous asset name @{match[1]}. Give the referenced assets different names.')
        tag = next(iter(tags))
        if tag is None:
            raise ValueError(f'Reference @{match[1]} was not loaded for MiniMax H3. Check the file and reference limits.')
        return tag
    return pattern.sub(replace, prompt)


def prompt_reference_rows(project, clip):
    catalog = [row for row in project.get('media', []) if isinstance(row, dict)]
    selected = set(clip.get('prompt_media_ids') or [])
    texts = [clip.get('prompt', '')]
    settings = project.get('settings') or {}
    for key in ('prepend_prompt', 'append_prompt'):
        if clip.get('use_' + key, True):
            texts.append(settings.get(key, ''))
    for row in catalog:
        if row.get('id') in (clip.get('media_ids') or []):
            texts.extend(point.get('description', '') for point in (row.get('video_shots') or {}).get('points', []))
    raw_text = '\n'.join(str(value or '') for value in texts)
    text = strip_comment_lines(raw_text)
    result = []
    for row in catalog:
        name = asset_name(row)
        pattern = r'(?<![A-Za-z0-9_@])@' + re.escape(name) + r'(?![\w])'
        mentioned = bool(name and re.search(pattern, text))
        comment_only = bool(name and re.search(pattern, raw_text) and not mentioned)
        if mentioned or (row.get('id') in selected and not comment_only):
            result.append(row)
    return result


def h3_prompt_skill(payload):
    selected = str(payload.get('skill') or '')
    if str(payload.get('agent') or 'MiniMaxH3') != 'MiniMaxH3':
        return selected
    rules = Path(__file__).with_name('h3_reference_skill.md').read_text(encoding='utf-8')
    return '\n\n'.join(part for part in (rules, selected) if part)
