import azure.functions as func
import logging
import os
import json
from datetime import datetime
from azure.storage.blob import BlobServiceClient
from azure.core.exceptions import ResourceNotFoundError
from openai import OpenAI

app = func.FunctionApp()

CONTAINER_NAME = os.getenv("AZURE_STORAGE_CONTAINER_NAME", "elai-kontejner")

# OpenAI klient
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

@app.route(route="history", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
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

@app.route(route="session", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
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


# =========================
# Blob helper
# =========================

def get_container_client():
    connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    blob_service_client = BlobServiceClient.from_connection_string(connection_string)
    return blob_service_client.get_container_client(CONTAINER_NAME)


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
# CHAT ENDPOINT
# =========================

@app.route(route="chat", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
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
        # 2) NAČTENÍ DAT
        # -------------------------
        prompt_text = read_blob_text("prompt.txt") or ""

        main_data = read_json_blob("main.json", {"meals": []})
        history_data = read_json_blob("history.json", {"history": []})
        session_data = read_json_blob("session.json", {"sessions": []})

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

        # posledních 15 zpráv
        messages.extend(todays_session["messages"][-15:])

        # -------------------------
        # 5) VOLÁNÍ OPENAI
        # -------------------------
        response = client.chat.completions.create(
            model="gpt-5-mini",
            messages=messages,
            response_format={"type": "json_object"}
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
        # 7) ULOŽENÍ SESSION
        # -------------------------
        todays_session["messages"].append({
            "role": "assistant",
            "content": reply
        })

        write_json_blob("session.json", session_data)

        # -------------------------
        # 8) HISTORY ADD
        # -------------------------
        if history_add:
            history_data["history"].append(history_add)
            write_json_blob("history.json", history_data)

        # -------------------------
        # 9) MAIN ADD
        # -------------------------
        if main_add:
            main_data["meals"].append(main_add)
            write_json_blob("main.json", main_data)

        # -------------------------
        # 10) MAIN UPDATE NOTE
        # -------------------------
        if main_update_note:
            meal_id = main_update_note.get("meal_id")
            note = main_update_note.get("note")

            for meal in main_data["meals"]:
                if meal.get("id") == meal_id:
                    meal.setdefault("notes", []).append(note)
                    break

            write_json_blob("main.json", main_data)

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
