"""
Bot de Telegram per a Piricat Energies (lampisteria i electricitat).
Usa Groq (gratuït i ràpid) per entendre preguntes en llenguatge natural.
Requereix: pip install httpx==0.28.1
"""

import asyncio
import httpx
import os

# ─────────────────────────────────────────────
#  CONFIGURACIÓ
# ─────────────────────────────────────────────
TOKEN    = os.environ.get("TOKEN")
GROQ_KEY = os.environ.get("GROQ_KEY")

TELEGRAM_API = f"https://api.telegram.org/bot{TOKEN}"
GROQ_API     = "https://api.groq.com/openai/v1/chat/completions"

# ─────────────────────────────────────────────
#  INFORMACIÓ DE L'EMPRESA
#  ⚠️ Revisa i actualitza el telèfon, el correu i l'horari amb les dades
#  reals — ara mateix hi ha valors d'exemple.
# ─────────────────────────────────────────────
INFO_EMPRESA = """
Ets l'assistent virtual de PIRICAT ENERGIES, una empresa de lampisteria i
electricitat que treballa a Andorra i a comarques del Pirineu de Lleida.
Respon sempre de forma amable, breu i en el mateix idioma que l'usuari (català, castellà o anglès).
Si no saps la resposta, digues que contactin directament amb l'empresa.
No inventis informació que no estigui aquí (preus exactes, terminis concrets, etc.).

=== INFORMACIÓ DE L'EMPRESA ===

SERVEIS:
- Lampisteria: fuites d'aigua, aixetes, escalfadors, desguassos, instal·lacions de bany i cuina.
- Electricitat: avaries elèctriques, quadres de llum, endolls, punts de llum, petites instal·lacions.

ZONES I TÈCNICS ASSIGNATS:
- Pallars Sobirà: 2 tècnics (Jordi Mir i Anna Solé)
- Pallars Jussà: 1 tècnic (Núria Farré)
- Alt Urgell: 1 tècnic (Laia Pujol)
- Alta Ribagorça: 1 tècnic (Martí Areny)
- Vall d'Aran: 1 tècnic (Guillem Barrau)
- Andorra: 1 tècnic (Ferran Costa)

COM FUNCIONA UN SERVEI:
1. El client explica l'avaria (per telèfon, correu o aquest xat de Telegram).
2. El servei s'assigna automàticament al tècnic de la seva comarca.
3. El client tria el dia: avui, demà o un altre dia.
4. Els serveis es resolen sempre per ordre estricte d'arribada (el primer que ha entrat, el primer que es resol), sigui quin sigui el dia triat.

PREUS: Depenen de la feina concreta. No es dona un preu fix per xat; cal valorar l'avaria per donar un pressupost real.

URGÈNCIES: Si sembla una urgència (fuita greu, curtcircuit, espurnes, olor a cremat), recomana trucar directament en lloc de continuar escrivint pel xat.

HORARI D'ATENCIÓ:
- Dilluns a Divendres: 8:00–19:00
- Caps de setmana: tancat, excepte urgències

CONTACTE:
- Telèfon: +34 600 00 00 00
- Email: info@piricatenergies.cat
- Web: https://gestor-empresa-1.onrender.com
"""

# ─────────────────────────────────────────────
#  COMUNICACIÓ AMB GROQ
# ─────────────────────────────────────────────
async def preguntar_groq(client: httpx.AsyncClient, pregunta: str) -> str:
    try:
        payload = {
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": INFO_EMPRESA},
                {"role": "user",   "content": pregunta}
            ],
            "max_tokens": 300,
            "temperature": 0.3
        }
        r = await client.post(
            GROQ_API,
            headers={
                "Authorization": f"Bearer {GROQ_KEY}",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=15
        )
        data = r.json()
        print(f"Resposta Groq: {data}")
        return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"Error Groq: {e}")
        return (
            "Ho sento, ara mateix no puc respondre. 🤔\n"
            "Contacta'ns directament:\n"
            "📞 +34 600 00 00 00\n"
            "📧 info@piricatenergies.cat"
        )

# ─────────────────────────────────────────────
#  COMUNICACIÓ AMB TELEGRAM
# ─────────────────────────────────────────────
async def enviar_missatge(client: httpx.AsyncClient, chat_id: int, text: str):
    await client.post(
        f"{TELEGRAM_API}/sendMessage",
        json={"chat_id": chat_id, "text": text},
        timeout=10
    )

async def obtenir_updates(client: httpx.AsyncClient, offset: int):
    r = await client.get(
        f"{TELEGRAM_API}/getUpdates",
        params={"offset": offset, "timeout": 30},
        timeout=35
    )
    return r.json().get("result", [])

# ─────────────────────────────────────────────
#  BUCLE PRINCIPAL
# ─────────────────────────────────────────────
async def main():
    print("=" * 45)
    print("  Bot Piricat Energies amb Groq en marxa!")
    print(f"  GROQ_KEY present: {bool(GROQ_KEY)}")
    print(f"  TOKEN present: {bool(TOKEN)}")
    print("  Prem Ctrl+C per aturar.")
    print("=" * 45)

    offset = 0
    async with httpx.AsyncClient() as client:
        while True:
            try:
                updates = await obtenir_updates(client, offset)
                for update in updates:
                    offset = update["update_id"] + 1
                    msg     = update.get("message", {})
                    text    = msg.get("text", "")
                    chat_id = msg.get("chat", {}).get("id")

                    if not chat_id or not text:
                        continue

                    if text.strip() == "/start":
                        await enviar_missatge(client, chat_id,
                            "Hola! Benvingut/da a Piricat Energies 👋\n"
                            "Sóc el teu assistent virtual. Pregunta'm el que vulguis sobre:\n\n"
                            "🔧 Lampisteria · ⚡ Electricitat · 📍 Zones\n"
                            "🛠️ Com demanar un servei · 🕙 Horari · 📞 Contacte"
                        )
                        continue

                    resposta = await preguntar_groq(client, text)
                    await enviar_missatge(client, chat_id, resposta)

            except Exception as e:
                print(f"Error: {e}")
                await asyncio.sleep(3)

if __name__ == "__main__":
    asyncio.run(main())
