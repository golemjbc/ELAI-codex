import azure.functions as func
import logging
import os
import json
import urllib.request
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
from azure.storage.blob import BlobServiceClient
from azure.core.exceptions import ResourceNotFoundError
from openai import OpenAI

app = func.FunctionApp()

CONTAINER_NAME = os.getenv("AZURE_STORAGE_CONTAINER_NAME", "elai-kontejner")

# OpenAI klient
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# =========================
# Pocasi (Pulecny, Rychnov u Jablonce nad Nisou)
# =========================
# Cachovano na cely den - nema smysl volat pri kazde zprave.

WEATHER_LAT = 50.68263
WEATHER_LON = 15.15124

_weather_cache = {"date": None, "text": None}


def get_weather_text():
    today = datetime.now().strftime("%Y-%m-%d")
    if _weather_cache["date"] == today and _weather_cache["text"]:
        return _weather_cache["text"]

    try:
        url = (
            "https://api.open-meteo.com/v1/forecast"
            f"?latitude={WEATHER_LAT}&longitude={WEATHER_LON}"
            "&daily=temperature_2m_max,precipitation_probability_max"
            "&timezone=Europe%2FPrague&forecast_days=1"
        )
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        max_temp = round(data["daily"]["temperature_2m_max"][0])
        rain_chance = data["daily"]["precipitation_probability_max"][0]

        text = (
            f"Dnesni predpoved pocasi (Pulecny u Rychnova u Jablonce nad Nisou): "
            f"nejvyssi teplota {max_temp} C, sance na dest {rain_chance} %."
        )

        _weather_cache["date"] = today
        _weather_cache["text"] = text
        return text
    except Exception as e:
        logging.warning(f"Nepodarilo se nacist predpoved pocasi: {e}")
        return None

@app.route(route="history", methods=["GET"], auth_level=func.AuthLevel.FUNCTION)
def get_history(req: func.HttpRequest) -> func.HttpResponse:
    try:
        history_data = read_json_blob("history.json", {"history": []})
        return func.HttpResponse(
            json.dumps(history_data, ensure_ascii=False),
            status_code=200,
            mimetype="application/json"
        )
    except Exception as e:
        logging.error(str(e))
        return func.HttpResponse(
            "Chyba načítání historie",
            status_code=500
        )

@app.route(route="session", methods=["GET"], auth_level=func.AuthLevel.FUNCTION)
def get_session(req: func.HttpRequest) -> func.HttpResponse:
    try:
        session_data = read_json_blob("session.json", {"sessions": []})
        return func.HttpResponse(
            json.dumps(session_data, ensure_ascii=False),
            status_code=200,
            mimetype="application/json"
        )
    except Exception as e:
        logging.error(str(e))
        return func.HttpResponse(
            "Chyba načítání session",
            status_code=500
        )

@app.route(route="main", methods=["GET"], auth_level=func.AuthLevel.FUNCTION)
def get_main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        main_data = read_json_blob("main.json", {"meals": []})
        return func.HttpResponse(
            json.dumps(main_data, ensure_ascii=False),
            status_code=200,
            mimetype="application/json"
        )
    except Exception as e:
        logging.error(str(e))
        return func.HttpResponse(
            "Chyba načítání jídel",
            status_code=500
        )


# =========================
# Blob helper
# =========================

_container_client = None


def get_container_client():
    # Znovupouzity klient napric requesty v ramci stejneho teploho behu
    # funkce - misto navazovani noveho spojeni na Storage pri kazdem
    # cteni/zapisu.
    global _container_client
    if _container_client is None:
        connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        _container_client = blob_service_client.get_container_client(CONTAINER_NAME)
    return _container_client


def read_blob_text(blob_name):
    container = get_container_client()
    blob_client = container.get_blob_client(blob_name)
    try:
        return blob_client.download_blob().readall().decode("utf-8")
    except ResourceNotFoundError:
        return None


def read_json_blob(blob_name, default_value):
    content = read_blob_text(blob_name)
    if content is None:
        return default_value
    try:
        return json.loads(content)
    except Exception:
        logging.error(f"Neplatný JSON v {blob_name}")
        return default_value


def write_json_blob(blob_name, data):
    container = get_container_client()
    blob_client = container.get_blob_client(blob_name)
    blob_client.upload_blob(
        json.dumps(data, ensure_ascii=False, indent=2),
        overwrite=True
    )


# =========================
# Validace akci od AI
# =========================
# AI musi vracet presne dany tvar objektu. Pokud neco vrati spatne
# (napr. pole misto objektu), radeji akci zahodime nez abychom
# poskodili data v history.json / main.json.

def is_valid_history_add(item):
    return (
        isinstance(item, dict)
        and isinstance(item.get("date"), str)
        and isinstance(item.get("meal_id"), str)
    )


def is_valid_main_add(item):
    return (
        isinstance(item, dict)
        and isinstance(item.get("id"), str)
        and isinstance(item.get("name"), str)
    )


def is_valid_main_update_note(item):
    return (
        isinstance(item, dict)
        and isinstance(item.get("meal_id"), str)
        and isinstance(item.get("note"), str)
    )


# =========================
# CHAT ENDPOINT
# =========================

@app.route(route="chat", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def chat(req: func.HttpRequest) -> func.HttpResponse:
    try:
        # -------------------------
        # 1) VALIDACE VSTUPU
        # -------------------------
        try:
            body = req.get_json()
        except Exception:
            return func.HttpResponse("Neplatné JSON tělo", status_code=400)

        user_input = body.get("message")

        if not user_input:
            return func.HttpResponse("Chybí message", status_code=400)

        today = datetime.now().strftime("%Y-%m-%d")

        # -------------------------
        # 2) NAČTENÍ DAT (souběžně, misto 4 cteni za sebou)
        # -------------------------
        with ThreadPoolExecutor(max_workers=5) as executor:
            prompt_future = executor.submit(read_blob_text, "prompt.txt")
            main_future = executor.submit(read_json_blob, "main.json", {"meals": []})
            history_future = executor.submit(read_json_blob, "history.json", {"history": []})
            session_future = executor.submit(read_json_blob, "session.json", {"sessions": []})
            weather_future = executor.submit(get_weather_text)

            prompt_text = prompt_future.result() or ""
            main_data = main_future.result()
            history_data = history_future.result()
            session_data = session_future.result()
            weather_text = weather_future.result()

        # -------------------------
        # 3) SESSION LOGIKA
        # -------------------------
        todays_session = next(
            (s for s in session_data["sessions"] if s["date"] == today),
            None
        )

        if not todays_session:
            todays_session = {"date": today, "messages": []}
            session_data["sessions"].append(todays_session)

        # přidej user zprávu
        todays_session["messages"].append({
            "role": "user",
            "content": user_input
        })

        # -------------------------
        # 4) SESTAVENÍ PROMPTU
        # -------------------------
        messages = [
            {"role": "system", "content": prompt_text},
            {
                "role": "system",
                "content": "MAIN DATA: " + json.dumps(main_data, ensure_ascii=False)
            },
            {
                "role": "system",
                "content": "HISTORY DATA: " + json.dumps(
                    history_data["history"][-10:], ensure_ascii=False
                )
            }
        ]

        if weather_text:
            messages.append({"role": "system", "content": "POCASI: " + weather_text})

        # posledních 15 zpráv
        messages.extend(todays_session["messages"][-15:])

        # -------------------------
        # 5) VOLÁNÍ OPENAI
        # -------------------------
        response = client.chat.completions.create(
            model="gpt-5-mini",
            messages=messages,
            response_format={"type": "json_object"},
            reasoning_effort="minimal",
            verbosity="low"
        )

        ai_text = response.choices[0].message.content.strip()

        # -------------------------
        # 6) PARSOVÁNÍ AI JSON
        # -------------------------
        try:
            ai_result = json.loads(ai_text)
        except Exception:
            logging.error("AI nevrátil validní JSON")
            return func.HttpResponse(
                json.dumps({"reply": "AI odpověď nebyla validní JSON."}),
                status_code=500,
                mimetype="application/json"
            )

        reply = ai_result.get("reply", "")

        actions = ai_result.get("actions", {
            "history_add": None,
            "main_add": None,
            "main_update_note": None
        })

        history_add = actions.get("history_add")
        main_add = actions.get("main_add")
        main_update_note = actions.get("main_update_note")

        # -------------------------
        # 7) PŘÍPRAVA SESSION (jen v paměti, zápis až na konci)
        # -------------------------
        todays_session["messages"].append({
            "role": "assistant",
            "content": reply
        })

        # Session soubor by jinak rostl navzdy - stare konverzace uz appka
        # nikde nepouziva (do promptu jde jen dnesni session), takze je
        # pred ulozenim oriznem. Drzi to soubor mensi a zapis/cteni rychlejsi.
        cutoff = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        session_data["sessions"] = [
            s for s in session_data["sessions"] if s.get("date", "") >= cutoff
        ]

        # -------------------------
        # 8) MAIN ADD (jen v paměti)
        # -------------------------
        # Zpracovano pred history_add, aby uz melo nove jidlo jmeno,
        # pokud uzivatel v jedne zprave rekne "dal jsem si X poprve a bylo skvele".
        main_changed = False

        if main_add:
            if not is_valid_main_add(main_add):
                logging.warning(f"main_add ma neplatny tvar, ignorovan: {main_add!r}")
            else:
                existing_ids = {meal.get("id") for meal in main_data["meals"]}
                if main_add.get("id") not in existing_ids:
                    main_data["meals"].append(main_add)
                    main_changed = True
                else:
                    logging.warning(f"main_add s jiz existujicim id ignorovan: {main_add.get('id')}")

        # -------------------------
        # 9) HISTORY ADD (jen v paměti)
        # -------------------------
        history_changed = False

        if history_add:
            if not is_valid_history_add(history_add):
                logging.warning(f"history_add ma neplatny tvar, ignorovan: {history_add!r}")
            else:
                meal = next(
                    (m for m in main_data["meals"] if m.get("id") == history_add.get("meal_id")),
                    None
                )
                if meal:
                    history_add["meal_name"] = meal.get("name")

                history_data["history"].append(history_add)
                history_changed = True

        # -------------------------
        # 10) MAIN UPDATE NOTE (jen v paměti)
        # -------------------------
        if main_update_note:
            if not is_valid_main_update_note(main_update_note):
                logging.warning(f"main_update_note ma neplatny tvar, ignorovan: {main_update_note!r}")
            else:
                meal_id = main_update_note.get("meal_id")
                note = main_update_note.get("note")

                for meal in main_data["meals"]:
                    if meal.get("id") == meal_id:
                        meal.setdefault("notes", []).append(note)
                        main_changed = True
                        break

        # -------------------------
        # 10b) ZÁPIS ZMĚN (souběžně, misto za sebou)
        # -------------------------
        # main.json se zapise nejvyse jednou, i kdyz ho zmenily obe akce
        # (main_add i main_update_note) - drive se pri soubehu obou zapisoval
        # zbytecne dvakrat.
        write_jobs = [("session.json", session_data)]
        if main_changed:
            write_jobs.append(("main.json", main_data))
        if history_changed:
            write_jobs.append(("history.json", history_data))

        with ThreadPoolExecutor(max_workers=len(write_jobs)) as executor:
            futures = [executor.submit(write_json_blob, name, data) for name, data in write_jobs]
            for f in futures:
                f.result()

        # -------------------------
        # 11) RESPONSE
        # -------------------------
        return func.HttpResponse(
            json.dumps({"reply": reply}, ensure_ascii=False),
            status_code=200,
            mimetype="application/json"
        )

    except Exception as e:
        logging.error(str(e))
        return func.HttpResponse(
            f"Chyba: {str(e)}",
            status_code=500
        )
