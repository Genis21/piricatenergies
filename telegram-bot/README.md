# Bot de Telegram — Piricat Energies

Bot conversacional per a Telegram que respon preguntes sobre l'empresa
(serveis, zones, com demanar un servei, horaris, contacte...) fent servir
Groq (un servei d'IA gratuït i molt ràpid) perquè entengui les preguntes
formulades de qualsevol manera, no només per paraules clau.

## 📂 On va aquest codi

Aquesta carpeta (`telegram-bot/`) és **independent** del servidor Node.js
(`server.js` / `public/`). No calen al mateix lloc: pots afegir-la com una
carpeta més dins del mateix repositori de GitHub `piricatenergies`, o bé
crear-ne un de nou només per al bot. Qualsevol de les dues opcions funciona;
aquí expliquem la primera perquè no cal gestionar dos repositoris.

```
piricatenergies/
├── server.js                 (el gestor de serveis, sense canvis)
├── public/                    (sense canvis)
├── package.json
└── telegram-bot/              ← carpeta NOVA
    ├── piricat_bot.py
    └── requirements.txt
```

## 🧩 Pas 1 — Crear el bot a Telegram

1. Obre Telegram i cerca **@BotFather**.
2. Envia-li `/newbot`.
3. Posa-li un nom (ex: `Piricat Energies Bot`) i un usuari acabat en `bot`
   (ex: `PiricatEnergiesBot`).
4. BotFather et donarà un **token** amb aquest aspecte:
   `123456789:AAExemple-DeToken_NoUsarAquest`
   Guarda'l, és el valor de la variable `TOKEN`.

## 🧩 Pas 2 — Aconseguir una clau de Groq (gratuïta)

1. Vés a **console.groq.com** i crea un compte.
2. Dins del tauler, ves a **API Keys** → **Create API Key**.
3. Copia la clau (comença per `gsk_...`). És el valor de `GROQ_KEY`.
4. El pla gratuït de Groq té un límit de peticions per minut/dia més que
   suficient per a un bot d'atenció al client d'una petita empresa.

## 🧩 Pas 3 — Pujar el codi a GitHub

1. Afegeix la carpeta `telegram-bot/` (amb `piricat_bot.py` i
   `requirements.txt`) al teu repositori `piricatenergies`, igual que vas
   fer amb la resta de fitxers.
2. Fes commit i push.

## 🧩 Pas 4 — Desplegar el bot a Render (com a servei separat)

Aquest bot NO és una pàgina web: es queda escoltant missatges de Telegram
tota l'estona (procés continu), així que a Render s'ha de crear com a
**Background Worker**, no com a Web Service:

1. Al Dashboard de Render, prem **New +** → **Background Worker**.
2. Connecta el mateix repositori `piricatenergies`.
3. **Root Directory**: escriu `telegram-bot` (perquè Render sàpiga que ha
   d'executar-se des d'aquesta subcarpeta).
4. **Runtime**: Python 3.
5. **Build Command**: `pip install -r requirements.txt`
6. **Start Command**: `python piricat_bot.py`
7. A **Environment**, afegeix dues variables:
   - `TOKEN` → el token de BotFather (pas 1)
   - `GROQ_KEY` → la clau de Groq (pas 2)
8. Prem **Create Background Worker**. Render l'instal·larà i l'engegarà.

> Nota: els Background Workers de Render normalment requereixen un pla de
> pagament (no hi ha capa gratuïta per a aquest tipus de servei, a
> diferència dels Web Services). Si vols mantenir-ho gratuït, una
> alternativa és executar aquest script en un ordinador/Raspberry Pi propi
> sempre encès, o en un servei com Railway.app, que sí que ofereix un pla
> gratuït per a processos d'aquest tipus.

## 🧩 Pas 5 — Provar el bot

1. Obre Telegram i cerca el nom d'usuari que li vas posar al bot
   (ex: `@PiricatEnergiesBot`).
2. Envia `/start` → hauria de respondre amb el missatge de benvinguda.
3. Prova preguntes en llenguatge natural, per exemple:
   - "Tinc una fuita d'aigua a casa, què faig?"
   - "Feu servei a la Vall d'Aran?"
   - "Quin horari teniu els dissabtes?"

## ✏️ Abans de publicar-lo: revisa `piricat_bot.py`

Dins del bloc `INFO_EMPRESA`, hi ha dades d'exemple que has de substituir
per les reals:
- Telèfon (`+34 600 00 00 00`)
- Correu (`info@piricatenergies.cat`)
- Horari d'atenció
- Noms dels tècnics, si canvien

També pots ampliar aquest text amb qualsevol informació addicional que
vulguis que el bot conegui (preus orientatius, promocions, etc.) — tot el
que hi ha dins d'`INFO_EMPRESA` és el "coneixement" del bot.

## 🔍 Diferència amb el xatbot de la web

Aquest bot de Telegram i el xatbot de `public/index.html`
(`chatbot-simple.js` / `chatbot-api.js`) són dues coses independents:
- El de la **web** viu dins del navegador del client i respon des del
  mateix servidor Node.
- El de **Telegram** és un procés Python separat que parla amb l'API de
  Telegram i amb l'API de Groq.

Pots fer servir els dos alhora sense cap conflicte, ja que no comparteixen
codi ni estat.
