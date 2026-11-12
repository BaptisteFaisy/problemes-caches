#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Micro-tests du balayeur Mergify : file, checks requis, API simulée.

Les cas 3 et 4 rejouent le blocage réel des PR #41/#42 (2026-11-11) : Mergify
disait `state: waiting` pendant que son check « Mergify Merge Queue » restait
`pending`, et le balayeur répondait `file:dedans` — la PR n'avançait plus.
Le payload publié par Mergify est désormais la seule source de vérité.
"""

import importlib.util
import os
import sys

spec = importlib.util.spec_from_file_location(
    'sweep', os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          'sweep.py'))
sweep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sweep)

FAILURES = []
REPO = 'BaptisteFaisy/problemes-caches'
SHA = '86aae35cb4b734d26c6b66bdab5e281a547c805a'


def check(label, condition):
    if condition:
        print('  ok   %s' % label)
    else:
        print('  ECHEC %s' % label)
        FAILURES.append(label)


class FakeApi:
    """Remplace sweep.api : enregistre les appels, renvoie des réponses figées."""

    def __init__(self):
        self.calls = []
        self.head_date = None       # date du commit de tête
        self.rules = None           # réponse GET /rules/branches/main
        self.checks = []            # check-runs de la tête

    def __call__(self, method, url, body=None, token=None):
        self.calls.append((method, url))
        if method != 'GET':
            return 201, {}
        if 'check-runs' in url:
            return 200, {'check_runs': self.checks}
        if '/rules/branches/' in url:
            if self.rules is None:
                return 404, {'message': 'introuvable'}
            return 200, self.rules
        if url.endswith('/commits/%s' % SHA):
            if self.head_date is None:
                return 404, {'message': 'introuvable'}
            return 200, {'commit': {'committer': {'date': self.head_date}}}
        return 404, None

    def called(self, method, fragment):
        return any(m == method and fragment in u for m, u in self.calls)


def run(fn, fx, *args):
    """Exécute `fn` avec sweep.api remplacé par le faux."""
    real = sweep.api
    sweep.api = fx
    try:
        return fn(*args)
    finally:
        sweep.api = real


def payload(state, queued_at=None):
    """Un commentaire Mergify réel, au format vu sur la PR #42."""
    body = ('{"version": 1, "state": "%s", "queue_rule_name": "default"' % state)
    if queued_at:
        body += ', "queued_at": "%s"' % queued_at
    body += ', "required_conditions": []}'
    return {'body': ('<!---\nDO NOT EDIT\n-*- Mergify Payload -*-\n%s\n'
                     '-*- Mergify Payload End -*-\n-->\n\n### Mergify\n' % body)}


def etat(state, queued_at=None):
    """Le payload tel que `last_mergify` le rend, depuis le vrai format publié.

    Passe volontairement par le parseur réel : le test rejoue la chaîne
    complète (commentaire Mergify -> JSON -> décision), pas un dict inventé.
    """
    return sweep.last_mergify([payload(state, queued_at)])


def queue_check(status='queued', conclusion=None):
    return {'name': 'Mergify Merge Queue', 'id': 1, 'status': status,
            'conclusion': conclusion}


def ruleset(*contexts):
    return [{'type': 'required_status_checks',
             'parameters': {'strict_required_status_checks_policy': False,
                            'required_status_checks':
                                [{'context': c} for c in contexts]}}]


print('1. Lecture du payload Mergify')
got = sweep.last_mergify([payload('merged', '2026-11-11T23:49:49.655373+00:00')])
check('payload réel analysé en JSON', got is not None and got['state'] == 'merged')
check('dernier payload gagne', sweep.last_mergify(
    [payload('waiting'), payload('queued')])['state'] == 'queued')
check('aucun payload -> None', sweep.last_mergify([{'body': 'bonjour'}]) is None)
check('payload JSON cassé ignoré', sweep.last_mergify(
    [{'body': '-*- Mergify Payload -*-\n{casse\n-*- Mergify Payload End -*-'}]
) is None)

print('2. Dates')
check('format GitHub (Z)', sweep.parse_when('2026-11-11T23:38:24Z') is not None)
check('format Mergify (+00:00)',
      sweep.parse_when('2026-11-11T23:49:49.655373+00:00') is not None)
check('date illisible -> None', sweep.parse_when('pas-une-date') is None)
check('vide -> None', sweep.parse_when(None) is None)
check('Z et +00:00 comparables',
      sweep.parse_when('2026-11-11T23:38:24Z')
      < sweep.parse_when('2026-11-11T23:49:49.655373+00:00'))

print('3. REGRESSION : waiting + check pending ne valent pas « dans la file »')
fx = FakeApi()
fx.checks = [queue_check('queued'), queue_check('in_progress')]
dans = run(sweep.queued_now, fx, REPO, 'tok', SHA, etat('waiting'))
check('state=waiting -> hors file', dans is False)
check("le check-run n'est plus consulté", not fx.called('GET', 'check-runs'))

print('4. REGRESSION : aucun payload -> hors file (on remet en file)')
fx = FakeApi()
fx.checks = [queue_check('in_progress')]
check('sans payload -> hors file',
      run(sweep.queued_now, fx, REPO, 'tok', SHA, None) is False)

print('5. Cas où la PR est bien dans la file')
fx = FakeApi()
fx.head_date = '2026-11-11T23:38:24Z'
check('state=queued, tête antérieure -> dans la file',
      run(sweep.queued_now, fx, REPO, 'tok', SHA,
          etat('queued', '2026-11-11T23:49:49.655373+00:00')) is True)
fx = FakeApi()
fx.head_date = None
check('state=queued, date de tête inconnue -> dans la file',
      run(sweep.queued_now, fx, REPO, 'tok', SHA,
          etat('queued', '2026-11-11T23:49:49.655373+00:00')) is True)
fx = FakeApi()
fx.head_date = '2026-11-12T09:00:00Z'
check('state=queued mais tête poussée après -> entrée périmée, hors file',
      run(sweep.queued_now, fx, REPO, 'tok', SHA,
          etat('queued', '2026-11-11T23:49:49.655373+00:00')) is False)
check('state=merged -> hors file',
      run(sweep.queued_now, FakeApi(), REPO, 'tok', SHA,
          etat('merged', '2026-11-11T23:49:49.655373+00:00')) is False)

print('6. Checks requis : le ruleset fait foi')
fx = FakeApi()
fx.rules = ruleset('ci', 'ci-budget', 'couche0')
req = run(sweep.required_checks, fx, REPO, 'tok')
check('ruleset lu', req == ('ci', 'ci-budget', 'couche0', 'stale-base-guard'))
check('hermes-lite/verdict exclu (non requis, workers sourds)',
      'hermes-lite/verdict' not in req)
check("ci et couche0 présents (absents de l'ancienne constante)",
      'ci' in req and 'couche0' in req)
fx = FakeApi()
fx.rules = None
check('ruleset illisible -> repli',
      run(sweep.required_checks, fx, REPO, 'tok')
      == ('ci', 'ci-budget', 'couche0', 'stale-base-guard'))
fx = FakeApi()
fx.rules = [{'type': 'deletion'}]
check('ruleset sans checks requis -> repli',
      run(sweep.required_checks, fx, REPO, 'tok')
      == ('ci', 'ci-budget', 'couche0', 'stale-base-guard'))

print('7. Vert : un hermes-lite/verdict qui pendouille ne bloque plus')
req = ('ci', 'ci-budget', 'couche0', 'stale-base-guard')
verts = [{'name': n, 'id': i, 'status': 'completed', 'conclusion': 'success'}
         for i, n in enumerate(req)]
fx = FakeApi()
fx.checks = verts + [{'name': 'hermes-lite/verdict', 'id': 99,
                      'status': 'in_progress', 'conclusion': None}]
ok, detail = run(sweep.checks_green, fx, REPO, 'tok', SHA, req)
check('verts + hermes en cours -> ok', ok is True)
check('hermes absent du détail', 'hermes' not in detail)
fx = FakeApi()
fx.checks = [c for c in verts if c['name'] != 'couche0']
ok, detail = run(sweep.checks_green, fx, REPO, 'tok', SHA, req)
check('couche0 manquant -> non vert', ok is False and 'couche0=?' in detail)
fx = FakeApi()
fx.checks = verts[:-1] + [{'name': 'ci', 'id': 200, 'status': 'completed',
                           'conclusion': 'failure'}]
ok, detail = run(sweep.checks_green, fx, REPO, 'tok', SHA, req)
check('ci en échec -> non vert', ok is False)
fx = FakeApi()
fx.checks = verts + [{'name': 'ci', 'id': 300, 'status': 'completed',
                      'conclusion': 'success'}]
ok, _ = run(sweep.checks_green, fx, REPO, 'tok', SHA, req)
check('le dernier run du même nom gagne', ok is True)

print()
if FAILURES:
    print('ÉCHECS : %d -> %s' % (len(FAILURES), ', '.join(FAILURES)))
    sys.exit(1)
print('Tous les tests passent.')
