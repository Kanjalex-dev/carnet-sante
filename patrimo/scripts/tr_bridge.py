#!/usr/bin/env python3
"""
Pont Python vers Trade Republic, via la bibliotheque non officielle `pytr`.

AVERTISSEMENT — a lire avant d'activer ce connecteur
-----------------------------------------------------
Trade Republic ne publie AUCUNE API. Ce pont rejoue le protocole websocket de
l'application mobile via `pytr`. Concretement :

  * c'est contraire aux conditions generales de Trade Republic ;
  * cela peut cesser de fonctionner du jour au lendemain, a chaque mise a jour
    de leur application ;
  * les noms de messages utilises ci-dessous sont ceux observes par le projet
    pytr. Ils ne sont garantis par personne.

Si ce pont tombe en panne, l'application continue de fonctionner : le module
patrimoine bascule sur la saisie manuelle. C'est le comportement voulu — aucun
connecteur non officiel ne doit etre un point de defaillance bloquant.

Contrat de sortie
-----------------
Le script ecrit un unique objet JSON sur la sortie standard :

    {"ok": true,  "data": {...}}
    {"ok": false, "error": "message lisible"}

Toute trace de diagnostic part sur stderr, jamais sur stdout.

Usage
-----
    python tr_bridge.py login          # premiere authentification (2FA interactif)
    python tr_bridge.py portfolio      # positions + liquidites
    python tr_bridge.py transactions   # historique des operations
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import traceback
from typing import Any


def emit(payload: dict[str, Any]) -> None:
    """Ecrit la reponse JSON et termine."""
    json.dump(payload, sys.stdout, ensure_ascii=False, default=str)
    sys.stdout.write("\n")
    sys.stdout.flush()


def fail(message: str, detail: str | None = None) -> None:
    if detail:
        print(detail, file=sys.stderr)
    emit({"ok": False, "error": message})
    sys.exit(1)


try:
    from pytr.api import TradeRepublicApi  # type: ignore
except ImportError:
    fail(
        "La bibliotheque pytr n'est pas installee dans cet environnement Python. "
        "Installer avec : pip install pytr"
    )


def build_client() -> "TradeRepublicApi":
    phone = os.environ.get("TR_PHONE", "").strip()
    pin = os.environ.get("TR_PIN", "").strip()
    if not phone or not pin:
        fail("TR_PHONE et TR_PIN doivent etre definis dans l'environnement.")
    return TradeRepublicApi(phone_no=phone, pin=pin)


async def collect(client: "TradeRepublicApi", subscriptions: list[dict[str, Any]],
                  timeout: float = 25.0) -> dict[str, Any]:
    """
    Envoie plusieurs souscriptions et collecte une reponse par souscription.

    On passe par `subscribe`/`recv` plutot que par les fonctions de confort de
    pytr : ces dernieres changent de nom entre versions, alors que les types de
    messages du protocole sont plus stables.
    """
    await client.subscribe_to_websocket() if hasattr(
        client, "subscribe_to_websocket"
    ) else None

    pending: dict[str, dict[str, Any]] = {}
    for sub in subscriptions:
        sub_id = await client.subscribe(sub)
        pending[str(sub_id)] = sub

    results: dict[str, Any] = {}
    deadline = asyncio.get_event_loop().time() + timeout

    while pending and asyncio.get_event_loop().time() < deadline:
        try:
            remaining = deadline - asyncio.get_event_loop().time()
            sub_id, subscription, response = await asyncio.wait_for(
                client.recv(), timeout=max(1.0, remaining)
            )
        except asyncio.TimeoutError:
            break
        key = subscription.get("type", str(sub_id))
        results[key] = response
        pending.pop(str(sub_id), None)

    return results


async def cmd_portfolio() -> dict[str, Any]:
    client = build_client()
    client.resume_websession()

    data = await collect(
        client,
        [
            {"type": "compactPortfolio"},
            {"type": "cash"},
            {"type": "availableCash"},
        ],
    )

    positions_raw = data.get("compactPortfolio", {}) or {}
    positions = positions_raw.get("positions", []) if isinstance(positions_raw, dict) else []

    # Les cours ne sont pas inclus dans compactPortfolio : on les demande
    # separement, une souscription "ticker" par ISIN.
    isins = [p.get("instrumentId") for p in positions if p.get("instrumentId")]
    prices: dict[str, float] = {}
    names: dict[str, str] = {}

    if isins:
        price_data = await collect(
            client,
            [{"type": "ticker", "id": isin} for isin in isins],
            timeout=30.0,
        )
        for key, payload in price_data.items():
            if not isinstance(payload, dict):
                continue
            isin = payload.get("isin") or key
            last = payload.get("last") or {}
            if isinstance(last, dict) and "price" in last:
                try:
                    prices[isin] = float(last["price"])
                except (TypeError, ValueError):
                    pass

        detail_data = await collect(
            client,
            [{"type": "instrument", "id": isin} for isin in isins],
            timeout=30.0,
        )
        for key, payload in detail_data.items():
            if isinstance(payload, dict):
                isin = payload.get("isin") or key
                names[isin] = payload.get("shortName") or payload.get("name") or isin

    holdings = []
    for position in positions:
        isin = position.get("instrumentId")
        if not isin:
            continue
        try:
            quantity = float(position.get("netSize") or position.get("virtualSize") or 0)
        except (TypeError, ValueError):
            quantity = 0.0
        try:
            average = float(position.get("averageBuyIn") or 0)
        except (TypeError, ValueError):
            average = 0.0
        unit_price = prices.get(isin, average)
        holdings.append(
            {
                "isin": isin,
                "name": names.get(isin, isin),
                "quantity": quantity,
                "unitPrice": unit_price,
                "value": round(quantity * unit_price, 2),
                "costBasis": round(quantity * average, 2) if average else None,
                "currency": "EUR",
            }
        )

    cash_payload = data.get("cash") or data.get("availableCash") or []
    cash_total = 0.0
    if isinstance(cash_payload, list):
        for entry in cash_payload:
            if isinstance(entry, dict):
                try:
                    cash_total += float(entry.get("amount") or 0)
                except (TypeError, ValueError):
                    pass

    return {"holdings": holdings, "cash": round(cash_total, 2), "currency": "EUR"}


async def cmd_transactions(limit: int = 200) -> dict[str, Any]:
    client = build_client()
    client.resume_websession()

    data = await collect(client, [{"type": "timelineTransactions"}], timeout=30.0)
    payload = data.get("timelineTransactions", {}) or {}
    items = payload.get("items", []) if isinstance(payload, dict) else []

    transactions = []
    for item in items[:limit]:
        if not isinstance(item, dict):
            continue
        amount = item.get("amount") or {}
        transactions.append(
            {
                "externalId": item.get("id"),
                "date": item.get("timestamp"),
                "title": item.get("title"),
                "subtitle": item.get("subtitle"),
                "eventType": item.get("eventType"),
                "amount": amount.get("value") if isinstance(amount, dict) else None,
                "currency": amount.get("currency", "EUR") if isinstance(amount, dict) else "EUR",
                "icon": item.get("icon"),
            }
        )

    return {"transactions": transactions}


def cmd_login() -> dict[str, Any]:
    """
    Premiere authentification. Trade Republic envoie un code a quatre chiffres
    dans l'application mobile ; il faut le saisir ici. La session est ensuite
    conservee par pytr, et les commandes suivantes n'ont plus besoin de 2FA
    jusqu'a expiration.
    """
    client = build_client()
    try:
        client.inititate_weblogin()
    except AttributeError:
        client.initiate_weblogin()  # orthographe corrigee dans les versions recentes

    code = input("Code recu dans l'application Trade Republic : ").strip()
    client.complete_weblogin(code)
    return {"loggedIn": True}


def main() -> None:
    if len(sys.argv) < 2:
        fail("Commande manquante. Attendu : login | portfolio | transactions")

    command = sys.argv[1]
    try:
        if command == "login":
            emit({"ok": True, "data": cmd_login()})
        elif command == "portfolio":
            emit({"ok": True, "data": asyncio.run(cmd_portfolio())})
        elif command == "transactions":
            limit = int(sys.argv[2]) if len(sys.argv) > 2 else 200
            emit({"ok": True, "data": asyncio.run(cmd_transactions(limit))})
        else:
            fail(f"Commande inconnue : {command}")
    except Exception as exc:  # noqa: BLE001 — on veut toujours un JSON en sortie
        fail(
            f"Echec du connecteur Trade Republic : {exc}",
            detail=traceback.format_exc(),
        )


if __name__ == "__main__":
    main()
