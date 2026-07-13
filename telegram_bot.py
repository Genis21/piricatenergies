"""
Bot de Telegram — Piricat Energies
Usa Groq (gratuït i ràpid) amb memòria de conversa.
Requereix: pip install httpx==0.28.1

IMPORTANT: TOKEN i GROQ_KEY es llegeixen de variables d'entorn.
No els posis mai directament en aquest fitxer. A Railway, defineix-les
a "Variables" del projecte: TOKEN i GROQ_KEY.
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

# Memòria de conversa per cada usuari: {chat_id: [missatges]}
HISTORIAL = {}
MAX_MISSATGES = 10  # Màxim de missatges que recorda per conversa

# ─────────────────────────────────────────────
#  INFORMACIÓ DE L'EMPRESA
#  *** Edita aquest bloc amb les dades reals de Piricat Energies ***
# ─────────────────────────────────────────────
INFO_BOTIGA = """
Piricat Energies és una empresa de lampisteria i electricitat que dona servei a tot el Pirineu des d'una única
centraleta a Sort (Pallars Sobirà), amb tècnics i magatzem propi a 6 comarques.

=== ZONA DE COBERTURA (comarca — magatzem) ===
- Val d'Aran — Vielha
- Alta Ribagorça — El Pont de Suert
- Pallars Jussà — Tremp
- Pallars Sobirà — Sort (seu central)
- Alt Urgell — La Seu d'Urgell
- Andorra — Andorra la Vella

=== CONTACTE ===
- Telèfon (centraleta única per a tot el territori): 973 620 555
- Seu: Sort, Pallars Sobirà

=== SERVEIS ===
- Lampisteria: fuites, avaries de caldera, canvis de sanitaris, xarxes de reg i instal·lacions d'aigua.
- Electricitat: talls de subministrament, quadres elèctrics, instal·lacions noves, manteniment preventiu i urgències 24h.
- Especialitzats en alta muntanya: refugis, cases aïllades, pistes d'esquí i nuclis de difícil accés.
- Sector turístic: contractes de manteniment per a hotels, apartaments turístics i cases rurals.

=== COM FUNCIONA (Sistema Smart-Queue) ===
1. El client truca a la centraleta de Sort i explica l'avaria.
2. La central consulta l'estat del tècnic de la seva comarca.
3. Si el tècnic està lliure, l'assignació és immediata i arriba en menys d'una hora.
4. Si el tècnic està ocupat, el client entra a la seva cua i rep confirmació (avui/demà/un altre dia) en menys d'una hora.
5. El tècnic tanca l'avís des de l'app quan acaba la feina.

=== PREUS ===
No hi ha una tarifa fixa publicada: el preu depèn de la feina i la comarca. Per a un pressupost cal trucar al 973 620 555.

=== REGLES CRÍTIQUES DE COMPORTAMENT (OBLIGATÒRIES) ===

1. RESTRICCIÓ D'INFORMACIÓ: Si el client demana qualsevol dada que NO estigui escrita en aquest text (per exemple:
   preus exactes, disponibilitat concreta d'un tècnic, dades personals de treballadors), RESPON EXACTAMENT:
   "No disposo d'aquesta informació específica ara mateix. Truca'ns al 973 620 555 i t'ho confirmem! 😊"

2. LLEI DE BREVITAT: Prohibit respondre més de 2 o 3 frases. Si la resposta pot ser una sola frase, millor. Sigues directe.

3. IDIOMA: Respon sempre en el mateix idioma que t'escrigui el client (Català o Castellà).

4. ZERO AL·LUCINACIONS: No inventis mai detalls que no siguin en aquest text.

5. URGÈNCIES: Si el client parla d'una urgència (fuita greu, tall elèctric, olor de cremat, etc.), digues-li clarament
   que truqui de seguida al 973 620 555 en comptes de continuar la conversa per xat.

=== EXEMPLES DE RESPOSTA CURTA ===

Client: "On sou?"
Resposta: "Coordinem tot el Pirineu des de la central de Sort, amb tècnics a 6 comarques. Truca'ns al 973 620 555! 📍"

Client: "Quant costa arreglar una fuita?"
Resposta: "No disposo d'aquesta informació específica ara mateix. Truca'ns al 973 620 555 i t'ho confirmem! 😊"

Client: "Tinc un tall de llum ara mateix, és urgent!"
Resposta: "Truca'ns immediatament al 973 620 555, ho marcarem com a urgent i prioritzarem el tècnic. ⚡"
"""
# ─────────────────────────────────────────────
#  COMUNICACIÓ AMB GROQ (amb historial)
# ─────────────────────────────────────────────
async def preguntar_groq(client: httpx.AsyncClient, chat_id: int, pregunta: str) -> str:
    try:
        if chat_id not in HISTORIAL:
            HISTORIAL[chat_id] = []

        HISTORIAL[chat_id].append({"role": "user", "content": pregunta})

        if len(HISTORIAL[chat_id]) > MAX_MISSATGES:
            HISTORIAL[chat_id] = HISTORIAL[chat_id][-MAX_MISSATGES:]

        missatges = [{"role": "system", "content": INFO_BOTIGA}] + HISTORIAL[chat_id]

        payload = {
            "model": "llama-3.3-70b-versatile",
            "messages": missatges,
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
        resposta = data["choices"][0]["message"]["content"].strip()

        HISTORIAL[chat_id].append({"role": "assistant", "content": resposta})

        return resposta

    except Exception as e:
        print(f"Error Groq: {e}")
        return (
            "Ho sento, ara mateix no puc respondre. 🤔\n"
            "Truca'ns directament:\n"
            "📞 973 620 555"
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
    if not TOKEN or not GROQ_KEY:
        print("⚠️  Falten variables d'entorn TOKEN i/o GROQ_KEY. Configura-les i torna a arrencar.")
        return

    print("=" * 45)
    print("  Bot Piricat Energies amb Groq + Memòria")
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
                        HISTORIAL[chat_id] = []
                        await enviar_missatge(client, chat_id,
                            "Hola! Benvingut/da a Piricat Energies ⚡\n"
                            "Sóc el teu assistent virtual. Pregunta'm el que vulguis sobre:\n\n"
                            "🔧 Serveis · 🗺️ Comarques · ⏱️ Com funciona la cua\n"
                            "🚨 Urgències · 💶 Pressupostos · 📞 Contacte\n\n"
                            "Per a urgències, truca directament al 973 620 555."
                        )
                        continue

                    if text.strip() == "/reset":
                        HISTORIAL[chat_id] = []
                        await enviar_missatge(client, chat_id,
                            "Conversa reiniciada. Torna a preguntar el que vulguis! 🔄"
                        )
                        continue

                    resposta = await preguntar_groq(client, chat_id, text)
                    await enviar_missatge(client, chat_id, resposta)

            except Exception as e:
                print(f"Error: {e}")
                await asyncio.sleep(3)

if __name__ == "__main__":
    asyncio.run(main())
