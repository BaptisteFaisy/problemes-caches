#!/usr/bin/env python3
"""Sonde du site de démonstration — les huit points à valider du cahier §16.

Usage :
    python3 tools/valide_site_demo.py [--site URL] [--json sortie.json] [--ecrire]

Le jeton d'API est lu dans `~/.atlassian-api-token` (jamais affiché, jamais
écrit dans le dépôt) ; le compte dans `~/.atlassian-email` ou `--email`.

Chaque point du §16 rend un verdict `OK` / `PARTIEL` / `ECHEC` avec la mesure
observée et la solution de repli prévue au cahier. Lecture seule par défaut :
`--ecrire` autorise le seul test qui modifie le site (créer une demande de test
et y poser un commentaire public au nom de l'agent, §7.4).

Endpoints utilisés (vérifiés le 2026-11-11 sur one-atlas-cndz.atlassian.net) :
`/rest/api/3/search/jql` — l'ancien `/rest/api/3/search` répond **410 Gone** ;
`/rest/api/3/issuetype` ; `/rest/servicedeskapi/{servicedesk,request,requesttype,
servicedesk/{id}/queue,assets/workspace}`.
"""

from __future__ import annotations

import argparse
import base64
import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_SITE = 'https://one-atlas-cndz.atlassian.net'
TIMEOUT = 45
PAGE = 100
MAX_PAGES = 10          # 1 000 tickets suffisent à juger du volume (§16 point 1)
MAX_DESKS = 12


class Site:
    """Client REST Jira / JSM minimal ; journalise les statuts, ne jette jamais."""

    def __init__(self, base: str, email: str, token: str) -> None:
        self.base = base.rstrip('/')
        self.auth = base64.b64encode(f'{email}:{token}'.encode()).decode()
        self.appels = 0

    def call(self, method: str, path: str, params: dict | None = None, body: dict | None = None):
        url = f'{self.base}{path}'
        if params:
            url += '?' + urllib.parse.urlencode(params)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header('Authorization', f'Basic {self.auth}')
        req.add_header('Content-Type', 'application/json')
        req.add_header('Accept', 'application/json')
        self.appels += 1
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                raw = resp.read().decode()
                return resp.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as err:
            return err.code, err.read().decode()[:200]
        except Exception as err:                                    # noqa: BLE001
            return 0, str(err)[:200]

    def get(self, path: str, params: dict | None = None):
        return self.call('GET', path, params)

    def post(self, path: str, body: dict | None = None):
        return self.call('POST', path, None, body)


def count_issues(site: Site, jql: str) -> int:
    """Compte les tickets d'une requête en paginant (`search/jql`, pas de total)."""
    total, token, pages = 0, None, 0
    while pages < MAX_PAGES:
        params = {'jql': jql, 'maxResults': PAGE, 'fields': 'summary'}
        if token:
            params['nextPageToken'] = token
        status, body = site.get('/rest/api/3/search/jql', params)
        if status != 200 or not isinstance(body, dict):
            return -1 if pages == 0 else total
        total += len(body.get('issues', []))
        token = body.get('nextPageToken')
        pages += 1
        if body.get('isLast') or not token:
            break
    return total


def service_desks(site: Site) -> list[dict]:
    status, body = site.get('/rest/servicedeskapi/servicedesk')
    if status == 200 and isinstance(body, dict):
        return body.get('values', [])[:MAX_DESKS]
    return []


def point1_volume(site: Site, desks: list[dict]) -> tuple[str, str]:
    """§16 point 1 : volume et variété des tickets d'exemple du site."""
    par_projet = {d['projectKey']: count_issues(site, f'project = {d["projectKey"]}') for d in desks}
    total = sum(v for v in par_projet.values() if v > 0)
    recents = sum(max(0, count_issues(site, f'project = {d["projectKey"]} AND created >= -90d'))
                  for d in desks[:6])
    top = sorted(par_projet.items(), key=lambda kv: kv[1], reverse=True)[:5]
    mesure = (f'{len(desks)} bureaux de services, {total} tickets au total mais '
              f'{recents} sur les 90 derniers jours ; ' + ', '.join(f'{k}={v}' for k, v in top))
    # PC-10 initialise 90 jours : sans ticket récent, l'app ne voit rien → le jeu
    # d'exemple (PC-12) et l'élargissement de fenêtre deviennent indispensables.
    etat = 'OK' if recents >= 50 else 'PARTIEL' if total > 0 else 'ECHEC'
    return etat, mesure


def point2_type_probleme(site: Site, desks: list[dict]) -> tuple[str, str]:
    """§10 : un type « Problème » existe-t-il pour porter le ticket unique ?"""
    status, body = site.get('/rest/api/3/issuetype')
    globaux = [t.get('name') for t in body] if status == 200 and isinstance(body, list) else []
    problem = [n for n in globaux if 'problem' in (n or '').lower()]
    par_projet = []
    for desk in desks[:6]:
        st, meta = site.get(f'/rest/api/3/issue/createmeta/{desk["projectKey"]}/issuetypes')
        if st == 200 and isinstance(meta, dict):
            noms = [t.get('name') for t in meta.get('values', [])]
            if any('problem' in (n or '').lower() for n in noms):
                par_projet.append(desk['projectKey'])
    mesure = (f'types globaux contenant « Problem » : {problem or "aucun"} ; '
              f'projets où le type est créable : {par_projet or "aucun"}')
    return ('OK' if problem else 'ECHEC'), mesure


def request_keys(site: Site, desks: list[dict], limite: int = 3) -> list[str]:
    """Demandes JSM réelles, trouvées par JQL (le filtre `projectKey` de l'API rend 0 ici)."""
    for desk in desks:
        jql = f'project = {desk["projectKey"]} AND "Request Type" is not EMPTY ORDER BY created DESC'
        status, body = site.get('/rest/api/3/search/jql', {'jql': jql, 'maxResults': limite, 'fields': 'summary'})
        if status == 200 and isinstance(body, dict) and body.get('issues'):
            return [i['key'] for i in body['issues']]
    return []


def point3_sla(site: Site, desks: list[dict]) -> tuple[str, str]:
    """§9 : les délais de service et leur dépassement sont-ils lisibles ?"""
    keys = request_keys(site, desks)
    if not keys:
        return 'ECHEC', 'aucune demande JSM trouvée par JQL sur les bureaux testés'
    for key in keys:
        st, sla = site.get(f'/rest/servicedeskapi/request/{key}/sla')
        if st == 200 and isinstance(sla, dict) and sla.get('values'):
            breches = [v.get('breached') for v in sla['values']]
            noms = [v.get('name', '?') for v in sla['values']][:3]
            return 'OK', f'{key} : {len(sla["values"])} délai(s) {noms}, dépassé(s)={breches}'
    return 'PARTIEL', f'{len(keys)} demande(s) lue(s) mais aucun délai renvoyé'


def point4_assets(site: Site) -> tuple[str, str]:
    """§8.2 : l'inventaire (Assets) est-il lisible pour l'indice « même équipement » ?"""
    st_ws, ws = site.get('/rest/servicedeskapi/assets/workspace')
    espaces = ws.get('values', []) if st_ws == 200 and isinstance(ws, dict) else []
    detail = 'aucun espace'
    if espaces:
        wid = espaces[0].get('workspaceId') or espaces[0].get('id')
        st_obj, obj = site.get(f'/rest/servicedeskapi/assets/workspace/{wid}/object/nav')
        detail = f'espace {wid} : objet/nav → {st_obj}'
        if st_obj == 200 and isinstance(obj, dict):
            detail += f', {len(obj.get("objectTypes", obj.get("values", [])))} type(s) d’objet'
    etat = 'OK' if st_ws == 200 and espaces else 'PARTIEL' if st_ws == 200 else 'ECHEC'
    return etat, f'assets/workspace → {st_ws}, {len(espaces)} espace(s) ; {detail}'


def point5_portail(site: Site, desks: list[dict]) -> tuple[str, str]:
    """§13 écran 6 : le bandeau peut-il dépendre du service consulté ?"""
    for desk in desks:
        st, rt = site.get(f'/rest/servicedeskapi/servicedesk/{desk["id"]}/requesttype')
        if st != 200 or not isinstance(rt, dict):
            continue
        valeurs = rt.get('values', [])
        groupes = sorted({v.get('group') for v in valeurs if v.get('group')})
        st_q, queues = site.get(f'/rest/servicedeskapi/servicedesk/{desk["id"]}/queue')
        nb_files = len(queues.get('values', [])) if st_q == 200 and isinstance(queues, dict) else 0
        mesure = (f'{desk["projectKey"]} : {len(valeurs)} types de demande, '
                  f'{len(groupes)} groupe(s) de services, {nb_files} file(s)')
        if groupes:
            return 'OK', mesure + f' ; groupes = {groupes[:5]}'
        if valeurs:
            return 'PARTIEL', mesure + ' ; aucun groupe → bandeau global'
    return 'ECHEC', 'aucun type de demande lisible'


def point6_commentaire(site: Site, desks: list[dict], ecrire: bool) -> tuple[str, str]:
    """§7.4 : peut-on poser un commentaire public au nom de l'agent ?"""
    if not ecrire:
        return 'NON TESTÉ', 'test écrit non demandé (relancer avec --ecrire)'
    if not desks:
        return 'ECHEC', 'aucun bureau de services'
    desk = desks[0]
    st, rt = site.get(f'/rest/servicedeskapi/servicedesk/{desk["id"]}/requesttype')
    types = rt.get('values', []) if st == 200 and isinstance(rt, dict) else []
    if not types:
        return 'ECHEC', 'aucun type de demande pour créer la demande de test'
    st, body, key = None, None, None
    for tipe in types[:4]:                     # certains types exigent des champs obligatoires
        st, body = site.post('/rest/servicedeskapi/request', {
            'serviceDeskId': str(desk['id']),
            'requestTypeId': str(tipe['id']),
            'requestFieldValues': {'summary': '[TEST APP] Validation Hidden Problems - a supprimer'},
        })
        if st in (200, 201):
            key = body['issueKey']
            break
    if not key:
        return 'ECHEC', f'création de la demande refusée : {st} {str(body)[:100]}'
    st2, body2 = site.post(f'/rest/servicedeskapi/request/{key}/comment',
                           {'body': 'Commentaire public de validation (app Hidden Problems).',
                            'public': True})
    st3, _ = site.call('DELETE', f'/rest/api/3/issue/{key}')
    etat = 'OK' if st2 in (200, 201) else 'ECHEC'
    return etat, (f'demande {key} créée, commentaire public → {st2}, puis supprimée ({st3})')


def point7_cout_modele(site: Site, desks: list[dict]) -> tuple[str, str]:
    """§14 : coût et durée de l'initialisation (100 requêtes modèle/min)."""
    total = sum(max(0, count_issues(site, f'project = {d["projectKey"]} and created >= -90d'))
                for d in desks[:6])
    minutes = max(1, round(total / 100))
    mesure = f'{total} tickets sur 90 jours (6 premiers bureaux) → ~{minutes} min de modèle'
    return ('OK' if total > 0 else 'PARTIEL'), mesure


def point8_evenements() -> tuple[str, str]:
    """§14 : les événements de ticket nécessaires sont déclarés dans le manifeste."""
    manifeste = pathlib.Path(__file__).resolve().parent.parent / 'manifest.yml'
    texte = manifeste.read_text(encoding='utf-8') if manifeste.exists() else ''
    requis = ['avi:jira:created:issue', 'avi:jira:updated:issue', 'avi:jira:commented:issue']
    presents = [e for e in requis if e in texte]
    return ('OK' if len(presents) == len(requis) else 'PARTIEL'), \
        f'{len(presents)}/{len(requis)} événements déclarés : {", ".join(presents)}'


REPLIS = {
    1: 'Jeu d’exemple injecté dans les tables de l’app (PC-12, bouton « Charger le jeu d’exemple »)',
    2: 'Type de ticket de problème choisi dans les réglages (settings.problemIssueType)',
    3: 'Poste « engagements de délai rompus » retiré du MVP (lot S)',
    4: 'Indice certain lu dans un champ du ticket, ou via Teamwork Graph',
    5: 'Bandeau global limité aux trois problèmes les plus actifs',
    6: 'Brouillon copié puis envoyé par l’agent (PC-18 : jamais d’envoi automatique)',
    7: 'Préfiltrage par indices certains, cache par empreinte, initialisation étalée par lots de 50',
    8: 'Recalcul nocturne seul (scheduledTrigger) si un événement venait à manquer',
}

TITRES = {
    1: 'Volume et variété des tickets d’exemple du site de démo',
    2: 'Type « Problème » présent pour porter le ticket unique (§10)',
    3: 'Lecture des délais de service et de leur dépassement (§9)',
    4: 'Inventaire (Assets) lisible pour l’indice « même équipement » (§8.2)',
    5: 'Bandeau du portail dynamique selon le service consulté (§13)',
    6: 'Commentaire public sur une demande au nom de l’agent (§7.4)',
    7: 'Coût et durée du modèle à l’initialisation (§14)',
    8: 'Événements de création / modification / commentaire (§14)',
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--site', default=DEFAULT_SITE)
    ap.add_argument('--email', default=None)
    ap.add_argument('--json', default=None)
    ap.add_argument('--ecrire', action='store_true')
    args = ap.parse_args()

    token_file = pathlib.Path('~/.atlassian-api-token').expanduser()
    if not token_file.exists():
        print('ECHEC : ~/.atlassian-api-token introuvable', file=sys.stderr)
        return 2
    email = args.email
    if not email:
        fichier = pathlib.Path('~/.atlassian-email').expanduser()
        email = fichier.read_text().strip() if fichier.exists() else 'baptiste.faisy@gmail.com'
    site = Site(args.site, email, token_file.read_text().strip())

    status, me = site.get('/rest/api/3/myself')
    if status != 200:
        print(f'ECHEC d’authentification sur {args.site} : {status}', file=sys.stderr)
        return 2
    print(f'Site {args.site} — connecté en tant que {me.get("displayName")}\n')

    desks = service_desks(site)
    mesures = {
        1: point1_volume(site, desks),
        2: point2_type_probleme(site, desks),
        3: point3_sla(site, desks),
        4: point4_assets(site),
        5: point5_portail(site, desks),
        6: point6_commentaire(site, desks, args.ecrire),
        7: point7_cout_modele(site, desks),
        8: point8_evenements(),
    }
    points = []
    for numero, (etat, mesure) in mesures.items():
        points.append({'point': numero, 'titre': TITRES[numero], 'etat': etat,
                       'mesure': mesure, 'repli': REPLIS[numero]})
        print(f'[{etat:9}] {numero}. {TITRES[numero]}\n            mesure : {mesure}'
              f'\n            repli  : {REPLIS[numero]}')

    bilans = {e: sum(1 for p in points if p['etat'] == e) for e in ('OK', 'PARTIEL', 'ECHEC', 'NON TESTÉ')}
    print(f'\nBilan : {bilans} — {site.appels} appels REST.')
    if args.json:
        pathlib.Path(args.json).write_text(json.dumps(
            {'site': args.site, 'points': points, 'appels': site.appels}, indent=2, ensure_ascii=False))
        print(f'Écrit dans {args.json}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
