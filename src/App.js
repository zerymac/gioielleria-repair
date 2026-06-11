import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import jsQR from "jsqr";
import zerrilloLogo from "./zerrillo_nero.png";

const uid = () => Math.random().toString(36).slice(2, 10);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const matchCustomer = (c, q) => {
  if (!q) return true;
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return words.every(w =>
    (c.nome||"").toLowerCase().includes(w) ||
    (c.cognome||"").toLowerCase().includes(w) ||
    (c.telefono||"").includes(w) ||
    (c.email||"").toLowerCase().includes(w)
  );
};
const today = () => new Date().toISOString().split("T")[0];
const repNum = (n) => `R${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
const ddtNum = (n) => `DDT${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
const ordNum = (n) => `ORD${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
const fullPhone = (c) => c?.telefonoPrefisso && c?.telefono ? (c.telefonoPrefisso + c.telefono).replace(/\D/g, "") : (c?.telefono || "").replace(/\D/g, "");
const displayPhone = (c) => c?.telefono ? `${c.telefonoPrefisso || "+39"} ${c.telefono}` : "";

function saveToContacts(c) {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${c.nome} ${c.cognome}`,
    `N:${c.cognome};${c.nome};;;`,
  ];
  if (c.telefono) lines.push(`TEL;TYPE=CELL,VOICE:${(c.telefonoPrefisso||"+39")}${c.telefono}`);
  if (c.email)    lines.push(`EMAIL;TYPE=INTERNET:${c.email}`);
  if (c.indirizzo)lines.push(`ADR;TYPE=HOME:;;${c.indirizzo};;;;`);
  if (c.codiceFiscale) lines.push(`X-CODICE-FISCALE:${c.codiceFiscale}`);
  lines.push("NOTE:Cliente Zerrillo Preziosi S.r.l.", "END:VCARD");
  const blob = new Blob([lines.join("\r\n")], { type: "text/vcard;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `${c.nome}_${c.cognome}.vcf`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

const PREFIXES = ["+39","+1","+33","+34","+41","+43","+44","+49","+31","+32","+351","+36","+48","+40","+380"];
const DITA = ["Pollice","Indice","Medio","Anulare","Mignolo"];

/* ── Dati gioielleria ── */
const SHOP = {
  nome:      "Zerrillo preziosi S.r.l.",
  indirizzo: "Piazza Angelo Ferrari 17-18",
  citta:     "17017 Millesimo (SV)",
  tel:       "019564570",
  pec:       "zerrillopreziosi@pec.it",
  email:     "info@zerrillopreziosi.it",
  web:       "www.zerrillopreziosi.it",
  piva:      "01705680096",
  sdi:       "WP7SE2Q",
};

const ORDER_STATUSES = {
  da_ordinare: { label:"Da ordinare", color:"#EF4444", bg:"#FEF2F2" },
  ordinato:    { label:"Ordinato",    color:"#3B82F6", bg:"#EFF6FF" },
  arrivato:    { label:"Arrivato",    color:"#7C3AED", bg:"#F5F3FF" },
  consegnato:  { label:"Consegnato",  color:"#B45309", bg:"#FFFBEB" },
  annullato:   { label:"Annullato",   color:"#6B7280", bg:"#F9FAFB" },
};

const STATUSES = {
  ricevuto:       { label:"Ricevuto",          color:"#3B82F6", bg:"#EFF6FF" },
  lavorazione:    { label:"In lavorazione",    color:"#D97706", bg:"#FFFBEB" },
  presso_esterno: { label:"Presso riparatore", color:"#7C3AED", bg:"#F5F3FF" },
  pronto:         { label:"Pronto",            color:"#059669", bg:"#ECFDF5" },
  consegnato:     { label:"Consegnato",        color:"#B45309", bg:"#FFFBEB" },
};

const CATS = [
  { id:"Gioiello",    icon:"💍", desc:"Anelli, collane, bracciali, orecchini" },
  { id:"Orologio",    icon:"⌚", desc:"Orologi da polso e da tasca" },
  { id:"Bigiotteria", icon:"✨", desc:"Accessori e bigiotteria varia" },
  { id:"Altro",       icon:"📦", desc:"Altri oggetti preziosi" },
];

const WORK_TYPES = [
  { id:"Riparazione",  icon:"🔧", desc:"Riparazione di componenti rotti" },
  { id:"Pulizia",      icon:"🫧", desc:"Pulizia e lucidatura professionale" },
  { id:"Ridimensione", icon:"📏", desc:"Modifica misura o dimensione" },
  { id:"Sostituzione", icon:"🔄", desc:"Sostituzione componenti" },
  { id:"Revisione",    icon:"🔍", desc:"Revisione e manutenzione" },
  { id:"Personaliz.",  icon:"🎨", desc:"Personalizzazione e incisione" },
];

const C = {
  gold:"#B8860B", surface:"#F2F2F7", white:"#FFFFFF",
  label:"#1C1C1E", secondary:"#8E8E93", separator:"#C6C6C8",
  blue:"#007AFF", green:"#34C759", red:"#FF3B30",
  purple:"#AF52DE", orange:"#FF9500",
};

/* ── API ── */
const toCustomer = (r) => ({ id:r.id, nome:r.nome, cognome:r.cognome, telefono:r.telefono, telefonoPrefisso:r.telefono_prefisso||"+39", email:r.email, indirizzo:r.indirizzo, codiceFiscale:r.codice_fiscale, note:r.note });
const toRepair = (r) => ({ id:r.id, numero:r.numero, customerId:r.customer_id, categoria:r.categoria, tipoLavoro:r.tipo_lavoro, descrizione:r.descrizione, materiali:r.materiali, problema:r.problema, status:r.status, preventivo:r.preventivo, prezzoFinale:r.prezzo_finale, preventivoAccettato:r.preventivo_accettato||false, richiestaPreventivo:r.richiesta_preventivo_fornitore||false, riparazioneInterna:r.riparazione_interna||false, spesa:r.spesa, acconto:r.acconto, dataRicevuta:r.data_ricevuta, dataConsegna:r.data_consegna, ddtId:r.ddt_id, note:r.note, fotoUrl:r.foto_url, eliminata:r.eliminata||false, items:r.items||null, mano:r.mano, dito:r.dito, operatore:r.operatore||null, dataSpedita:r.data_spedita||null, dataRientrata:r.data_rientrata||null, dataConsegnata:r.data_consegnata||null });
const toDDT = (r) => ({ id:r.id, numero:r.numero, data:r.data, riparatore:r.riparatore, riparazioniIds:r.riparazioni_ids||[], stato:r.stato, dataRientro:r.data_rientro, note:r.note });
const toOrder = (r) => ({ id:r.id, numero:r.numero, customerId:r.customer_id, dataOrdine:r.data_ordine, dataConsegnaPrevista:r.data_consegna_prevista, stato:r.stato||"ordinato", prodotti:r.prodotti||[], acconto:r.acconto, note:r.note, fotoUrl:r.foto_url||null, createdAt:r.created_at });

const api = {
  async getCustomers() {
  let all=[];
  let page=0;
  const size=1000;
  while(true){
    const {data}=await supabase.from("customers").select("*").order("cognome").range(page*size,(page+1)*size-1);
    if(!data||!data.length)break;
    all=[...all,...data.map(toCustomer)];
    if(data.length<size)break;
    page++;
  }
  return all;
},
  async upsertCustomer(c) { await supabase.from("customers").upsert({ id:c.id, nome:c.nome, cognome:c.cognome, telefono:c.telefono, telefono_prefisso:c.telefonoPrefisso||"+39", email:c.email, indirizzo:c.indirizzo, codice_fiscale:c.codiceFiscale, note:c.note }); },
  async getRepairs() { const {data}=await supabase.from("repairs").select("*").eq("eliminata",false).order("created_at",{ascending:false}); return (data||[]).map(toRepair); },
  async getDeletedRepairs() { const {data}=await supabase.from("repairs").select("*").eq("eliminata",true).order("created_at",{ascending:false}); return (data||[]).map(toRepair); },
  async upsertRepair(r) {
    const clean=(v)=>(v===""||v===null||v===undefined||isNaN(parseFloat(v)))?null:parseFloat(v);
    const cs=(v)=>(v===""||v===undefined)?null:v;
    const payload={ id:r.id, numero:r.numero, customer_id:cs(r.customerId), categoria:cs(r.categoria), tipo_lavoro:cs(r.tipoLavoro), descrizione:cs(r.descrizione), materiali:cs(r.materiali), problema:cs(r.problema), status:r.status||"ricevuto", preventivo:clean(r.preventivo), prezzo_finale:clean(r.prezzoFinale), preventivo_accettato:r.preventivoAccettato||false, richiesta_preventivo_fornitore:r.richiestaPreventivo||false, riparazione_interna:r.riparazioneInterna||false, spesa:clean(r.spesa), acconto:clean(r.acconto), data_ricevuta:r.dataRicevuta||null, data_consegna:r.dataConsegna||null, ddt_id:cs(r.ddtId), note:cs(r.note), foto_url:r.fotoUrl?.startsWith("http")?r.fotoUrl:null, eliminata:r.eliminata||false, items:r.items||null, operatore:cs(r.operatore), data_spedita:r.dataSpedita||null, data_rientrata:r.dataRientrata||null, data_consegnata:r.dataConsegnata||null };
    const {error}=await supabase.from("repairs").upsert(payload);
    if(error){
      if(error.code==="PGRST204"){const {acconto:_a,riparazione_interna:_ri,operatore:_op,data_spedita:_ds,data_rientrata:_dr,data_consegnata:_dc,...rest}=payload;await supabase.from("repairs").upsert(rest);}
      else console.error("upsertRepair:",error);
    }
  },
  async getNextRepairNum() { const {data}=await supabase.from("repairs").select("numero").order("created_at",{ascending:false}).limit(1); if(!data||!data.length) return repNum(1); const m=(data[0].numero||"").match(/\d{4}$/); return repNum(m?parseInt(m[0])+1:1); },
  async softDeleteRepair(id) { await supabase.from("repairs").update({eliminata:true}).eq("id",id); },
  async restoreRepair(id) { await supabase.from("repairs").update({eliminata:false}).eq("id",id); },
  async updateRepairStatus(id,status) { await supabase.from("repairs").update({status}).eq("id",id); },
  async updateRepairReturn(id,fields) { await supabase.from("repairs").update({ status:fields.status, spesa:fields.spesa, prezzo_finale:fields.prezzoFinale, preventivo:fields.prezzoFinale||fields.preventivo, data_rientrata:fields.dataRientrata||null }).eq("id",id); },
  async getDDTs() { const {data}=await supabase.from("ddts").select("*").order("created_at",{ascending:false}); return (data||[]).map(toDDT); },
  async upsertDDT(d) { await supabase.from("ddts").upsert({ id:d.id, numero:d.numero, data:d.data, riparatore:d.riparatore, riparazioni_ids:d.riparazioniIds, stato:d.stato, data_rientro:d.dataRientro, note:d.note }); },
  async deleteDDT(id) { await supabase.from("ddts").delete().eq("id",id); },
  async getRepairers() { const {data}=await supabase.from("repairers").select("*").order("nome"); return data||[]; },
  async upsertRepairer(r) {
    const {error}=await supabase.from("repairers").upsert(r);
    if(error&&error.code==="PGRST204"){
      const {citta:_c,provincia:_p,cap:_k,...rest}=r;
      await supabase.from("repairers").upsert(rest);
    }
  },
  async deleteRepairer(id) { await supabase.from("repairers").delete().eq("id",id); },
  async deleteCustomer(id) { await supabase.from("customers").delete().eq("id",id); },
  async getOrders() { const {data}=await supabase.from("orders").select("*").order("created_at",{ascending:false}); return (data||[]).map(toOrder); },
  async upsertOrder(o) {
    const cleanNum=(v)=>(v===""||v===null||v===undefined||isNaN(parseFloat(v)))?null:parseFloat(v);
    const cs=(v)=>(v===""||v===undefined)?null:v;
    const payload={ id:o.id, numero:o.numero, customer_id:cs(o.customerId), data_ordine:cs(o.dataOrdine), data_consegna_prevista:cs(o.dataConsegnaPrevista), stato:o.stato||"ordinato", prodotti:o.prodotti||[], acconto:cleanNum(o.acconto), note:cs(o.note), foto_url:cs(o.fotoUrl) };
    const {error}=await supabase.from("orders").upsert(payload);
    if(error&&error.code==="PGRST204"){const {foto_url:_f,...p2}=payload;const {error:e2}=await supabase.from("orders").upsert(p2);if(e2)console.error("upsertOrder:",e2);}
    else if(error) console.error("upsertOrder:",error);
  },
  async updateOrderStatus(id,stato) { await supabase.from("orders").update({stato}).eq("id",id); },
  async deleteOrder(id) { await supabase.from("orders").delete().eq("id",id); },
  async getNextOrderNum() { const {data}=await supabase.from("orders").select("numero").order("created_at",{ascending:false}).limit(1); if(!data||!data.length) return ordNum(1); const m=(data[0].numero||"").match(/\d{4}$/); return ordNum(m?parseInt(m[0])+1:1); },
};

/* ── AI ── */
async function aiCall(prompt,b64=null,mt="image/jpeg") {
  const key=process.env.REACT_APP_ANTHROPIC_KEY;
  if(!key||key==="placeholder") return "";
  const content=b64?[{type:"image",source:{type:"base64",media_type:mt,data:b64}},{type:"text",text:prompt}]:prompt;
  try { const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content}]})}); return (await r.json()).content?.[0]?.text||""; } catch { return ""; }
}
const aiEnabled=process.env.REACT_APP_ANTHROPIC_KEY&&process.env.REACT_APP_ANTHROPIC_KEY!=="placeholder";

/* ── Utils ── */
function compressImage(file,maxPx=800,quality=0.7) {
  return new Promise((resolve)=>{ const reader=new FileReader(); reader.onload=(e)=>{ const img=new Image(); img.onload=()=>{ const ratio=Math.min(maxPx/img.width,maxPx/img.height,1); const canvas=document.createElement("canvas"); canvas.width=img.width*ratio; canvas.height=img.height*ratio; canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height); canvas.toBlob((blob)=>resolve(blob),"image/jpeg",quality); }; img.src=e.target.result; }; reader.readAsDataURL(file); });
}
const blobToDataURL=(blob)=>new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=rej;r.readAsDataURL(blob);});

async function uploadPhoto(blob,repairId) {
  try { const path=`repairs/${repairId}.jpg`; const {error}=await supabase.storage.from("repair-photos").upload(path,blob,{upsert:true,contentType:"image/jpeg"}); if(error){console.error(error);return null;} const {data}=supabase.storage.from("repair-photos").getPublicUrl(path); return data.publicUrl; } catch(e){console.error(e);return null;}
}

/* Rende assoluto un URL relativo (necessario per logo in finestre esterne) */
/* Rende assoluto un URL relativo */
function absoluteUrl(url) {
  if(!url||url.startsWith('http')||url.startsWith('data:'))return url;
  if(url.startsWith('/'))return window.location.origin+url;
  try{return new URL(url,window.location.href).href;}catch{return url;}
}

/* Cache logo come data URL — risolve problema cross-origin su iOS Safari */
let _logoCached=null;
function getLogoForPrint(cb) {
  if(_logoCached){cb(_logoCached);return;}
  const abs=absoluteUrl(zerrilloLogo);
  fetch(abs)
    .then(r=>r.blob())
    .then(blob=>{
      const reader=new FileReader();
      reader.onload=e=>{_logoCached=e.target.result;cb(_logoCached);};
      reader.onerror=()=>{_logoCached=abs;cb(abs);};
      reader.readAsDataURL(blob);
    })
    .catch(()=>{_logoCached=abs;cb(abs);});
}

function printHTML(html) {
  getLogoForPrint(logoDataUrl=>{
    /* Sostituisce src del logo con data URL — funziona in qualsiasi contesto */
    const processed=html.replace(/src="([^"]*zerrillo[^"]*)"/g,`src="${logoDataUrl}"`);

    /* Blob URL — unico approccio affidabile su iOS Safari */
    const blob=new Blob([processed],{type:'text/html;charset=utf-8'});
    const blobUrl=URL.createObjectURL(blob);
    const win=window.open(blobUrl,'_blank');

    if(!win){
      URL.revokeObjectURL(blobUrl);
      alert('⚠️ Popup bloccato.\n\niPhone → Impostazioni → Safari → disattiva "Blocca popup"\n\nDopo aver abilitato i popup, riprova.');
      return;
    }

    const doPrint=()=>{try{win.print();}catch(e){console.error('print:',e);}};
    const cleanup=()=>{setTimeout(()=>{try{win.close();}catch(e){} URL.revokeObjectURL(blobUrl);},3000);};

    win.onload=()=>{
      /* Aspetta che tutte le img siano caricate (logo data URL + QR externos) */
      const imgs=Array.from(win.document.querySelectorAll('img'));
      const notLoaded=imgs.filter(img=>!img.complete);

      const fire=()=>{setTimeout(()=>{doPrint();cleanup();},300);};

      if(notLoaded.length===0){fire();return;}

      let done=0;
      notLoaded.forEach(img=>{
        const onDone=()=>{done++;if(done>=notLoaded.length)fire();};
        img.onload=onDone;
        img.onerror=onDone;
      });
      /* Timeout di sicurezza: stampa comunque dopo 5s anche se le img non caricano */
      setTimeout(()=>{doPrint();cleanup();},5000);
    };

    /* Fallback globale: su iOS onload a volte non scatta */
    setTimeout(()=>{if(win&&!win.closed){doPrint();} URL.revokeObjectURL(blobUrl);},9000);
  });
}

/* ── Rilevamento dispositivo ──────────────────────────────────────── */
/* iPadOS 13+ camuffa lo UA come Mac Desktop: serve il controllo su maxTouchPoints */
const isIOS = (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
               (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) &&
              !window.MSStream;

/* ── Stampa intelligente: server su iOS/iPadOS, dialogo nativo su Mac ── */
function smartPrint(html) {
  if (isIOS) {
    const serverUrl = localStorage.getItem('printServerUrl') || '';
    if (!serverUrl) {
      alert('⚠️ Server di stampa non configurato.\n\nVai in Impostazioni → Stampa e inserisci l\'IP del Mac Mini.');
      return;
    }
    fetch(`${serverUrl}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          const toast = document.createElement('div');
          toast.textContent = '🖨️ Etichetta inviata!';
          toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#059669;color:white;padding:12px 24px;border-radius:20px;font-size:15px;font-weight:700;z-index:9999;font-family:-apple-system,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3)';
          document.body.appendChild(toast);
          setTimeout(() => document.body.removeChild(toast), 2500);
        } else {
          alert('❌ Errore stampa: ' + (d.error || 'sconosciuto'));
        }
      })
      .catch(e => alert('❌ Impossibile raggiungere il server di stampa.\n\nVerifica che il Mac Mini sia acceso e il server attivo.\n\n' + e.message));
  } else {
    /* Mac/desktop → dialogo di stampa nativo del browser */
    printHTML(html);
  }
}
function parseVCards(text) {
  /* Normalizza CRLF e unfolda le righe di continuazione (spazio/tab iniziale) */
  const unfold=(raw)=>raw.replace(/\r\n/g,"\n").replace(/\r/g,"\n").replace(/\n[ \t]/g,"");

  /* Decodifica Quoted-Printable (vCard 2.1) */
  const decodeQP=(s)=>s.replace(/=([0-9A-Fa-f]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));

  /* Estrai valore di una property (gestisce ENCODING=QUOTED-PRINTABLE e CHARSET) */
  const propVal=(line)=>{
    const colon=line.indexOf(":");
    if(colon===-1)return "";
    const params=(line.slice(0,colon).toUpperCase());
    let val=line.slice(colon+1);
    if(params.includes("QUOTED-PRINTABLE"))val=decodeQP(val);
    try{val=decodeURIComponent(escape(val));}catch{} // tenta UTF-8
    return val.trim();
  };

  /* Preferenze per il tipo di telefono */
  const PHONE_PREF=["CELL","MOBILE","IPHONE","VOICE","HOME","WORK","OTHER"];

  const contacts=[];
  const blocks=unfold(text).split(/BEGIN:VCARD/i).slice(1);

  for(const block of blocks){
    const lines=block.split("\n").filter(l=>l&&!l.match(/^END:VCARD/i));

    /* Raccoglie tutte le occorrenze di una property (case-insensitive) */
    const getAll=(name)=>lines.filter(l=>new RegExp(`^${name}[;:]`,"i").test(l));
    const getFirst=(name)=>{ const l=getAll(name); return l.length?propVal(l[0]):""; };

    /* Nome: N:Cognome;Nome;Middle;Prefix;Suffix */
    let nome="",cognome="";
    const nLines=getAll("N");
    if(nLines.length){
      const parts=propVal(nLines[0]).split(";");
      cognome=(parts[0]||"").trim();
      nome=(parts[1]||"").trim();
      // Se il cognome è vuoto ma il nome è "Cognome Nome" (FN-style in N)
      if(!cognome&&nome.includes(" ")){
        const sp=nome.split(" ");nome=sp[0];cognome=sp.slice(1).join(" ");
      }
    }
    if(!nome&&!cognome){
      const fn=getFirst("FN");
      if(fn){const p=fn.split(" ");nome=p[0];cognome=p.slice(1).join(" ");}
    }
    if(!nome&&!cognome)continue; // salta record vuoti

    /* Telefono: prendi quello con priorità più alta (CELL > VOICE > HOME > …) */
    let telefono="",telefonoPrefisso="+39";
    const telLines=getAll("TEL");
    let bestTel=null,bestScore=999;
    for(const tl of telLines){
      const params=tl.slice(0,tl.indexOf(":")).toUpperCase();
      const score=PHONE_PREF.findIndex(p=>params.includes(p));
      if(score!==-1&&score<bestScore){bestScore=score;bestTel=tl;}
    }
    if(!bestTel&&telLines.length)bestTel=telLines[0];
    if(bestTel){
      const raw=propVal(bestTel).replace(/[\s\-\(\)\.]/g,"");
      const PREF_LIST=["+39","+44","+1","+33","+34","+41","+43","+49","+31","+32","+351","+36","+48","+40","+380"];
      if(raw.startsWith("+")){
        const found=PREF_LIST.find(p=>raw.startsWith(p));
        if(found){telefonoPrefisso=found;telefono=raw.slice(found.length);}
        else{const m=raw.match(/^(\+\d{1,3})(\d+)$/);if(m){telefonoPrefisso=m[1];telefono=m[2];}else telefono=raw;}
      }else if(raw.startsWith("00")){
        const found=PREF_LIST.find(p=>raw.startsWith("00"+p.slice(1)));
        if(found){telefonoPrefisso=found;telefono=raw.slice(("00"+found.slice(1)).length);}
        else telefono=raw.replace(/^00/,"");
      }else telefono=raw;
    }

    /* Email: prende il primo valore INTERNET o il primo disponibile */
    let email="";
    const emailLines=getAll("EMAIL");
    const emailPref=emailLines.find(l=>l.toUpperCase().includes("INTERNET"))||emailLines[0];
    if(emailPref)email=propVal(emailPref);

    /* Indirizzo: ADR ;pobox;ext;street;city;region;postal;country */
    let indirizzo="";
    const adrLines=getAll("ADR");
    const adrPref=adrLines.find(l=>l.toUpperCase().includes("HOME"))||adrLines[0];
    if(adrPref){
      const p=propVal(adrPref).split(";");
      const street=(p[2]||"").trim().replace(/\\n/g,", ");
      const city=(p[3]||"").trim();
      const postal=(p[5]||"").trim();
      indirizzo=[street,postal,city].filter(Boolean).join(", ");
    }

    /* Codice fiscale (non standard, ma alcune app lo salvano in NOTE o X-FISCAL-CODE) */
    let codiceFiscale="";
    const noteVal=getFirst("NOTE");
    const cfMatch=noteVal.match(/\b([A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z])\b/i);
    if(cfMatch)codiceFiscale=cfMatch[1].toUpperCase();

    contacts.push({id:uid(),nome,cognome,telefono,telefonoPrefisso,email,indirizzo,codiceFiscale,note:""});
  }
  return contacts;
}

/* ── CSS condiviso etichette 62mm — Brother QL continuous roll ── */
const LABEL_CSS=`
  *{box-sizing:border-box;margin:0;padding:0;font-weight:700}
  html,body{
    font-family:Arial,Helvetica,sans-serif;
    background:white;color:#000;font-weight:700;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
    -webkit-font-smoothing:none;font-smooth:never;
    text-rendering:geometricPrecision;
    width:62mm;
  }
  @page{size:62mm 100mm;margin:0}

  .label{
    width:59mm;height:98mm;
    margin:1mm 1.5mm;
    display:flex;flex-direction:column;
    overflow:hidden;page-break-after:always;
  }
  .label:last-child{page-break-after:auto}

  /* Header */
  .hdr{
    display:flex;justify-content:space-between;align-items:center;
    padding:1.5mm 0;border-bottom:1.5px solid #000;
    flex-shrink:0;
  }
  .logo{height:9mm;width:auto;object-fit:contain;flex-shrink:0}
  .copy{
    font-size:6.5pt;font-weight:800;
    background:#000;color:white;
    padding:2px 5px;border-radius:2px;white-space:nowrap;
  }

  /* QR + numero */
  .qr-row{
    display:flex;align-items:flex-start;
    gap:2mm;padding:2mm 0 1.5mm;flex-shrink:0;
  }
  .qr-img{width:22mm;height:22mm;display:block;flex-shrink:0}
  .qr-text{flex:1;min-width:0}
  .num{font-size:16pt;font-weight:900;letter-spacing:-.5px;line-height:1;margin-bottom:1mm;color:#000}
  .dts{font-size:7.5pt;color:#000;font-weight:700;line-height:1.8}

  /* Separatori */
  .div{height:.4mm;background:#555;margin:.8mm 0;flex-shrink:0}

  /* Etichette sezione */
  .sec{font-size:6.5pt;font-weight:800;color:#333;text-transform:uppercase;letter-spacing:.6px;margin-bottom:.8mm}

  /* Cliente top */
  .ctop{flex-shrink:0;padding:2mm 0 1.5mm}
  .ctop-name{font-size:15pt;font-weight:900;color:#000;line-height:1.1;letter-spacing:-.3px}
  .ctop-phone{font-size:8.5pt;color:#000;margin-top:.8mm;font-weight:700}

  /* Cliente (compat) */
  .cust{flex-shrink:0;padding:.3mm 0}
  .cname{font-size:11pt;font-weight:800;color:#000;line-height:1.2}
  .cphone{font-size:8pt;color:#000;margin-top:.4mm;font-weight:700}

  /* Oggetto */
  .obj{flex:1;padding:.3mm 0;display:flex;flex-direction:column;gap:.5mm;min-height:0}
  .ocat{font-size:9.5pt;font-weight:800;color:#000;line-height:1.2}
  .odesc{font-size:8.5pt;font-weight:700;color:#000;line-height:1.4}
  .omat{font-size:8pt;font-weight:700;color:#000;line-height:1.4}
  .oprob{font-size:8pt;font-weight:700;color:#000;line-height:1.4}
  .oprev-warn{font-size:7.5pt;color:#5B21B6;font-weight:800}
  .prev{
    display:flex;justify-content:space-between;align-items:center;
    background:#FDF6DC;border-radius:1.5mm;
    border:.4mm solid #B8860B;
    padding:.8mm 2mm;margin-top:1mm;
    flex-shrink:0;
  }
  .prevl{font-size:7.5pt;color:#7A5800;font-weight:800}
  .prevv{font-size:12pt;font-weight:900;color:#7A5800}

  /* Footer */
  .foot{
    border-top:.4mm solid #555;
    padding:.8mm 0 0;
    flex-shrink:0;
    font-size:6pt;color:#333;font-weight:700;
    text-align:center;line-height:1.6;
  }

  /* Lista oggetti multi */
  .items{display:flex;flex-direction:column;gap:.5mm;margin-top:.5mm}
  .irow{display:flex;gap:1.5mm;align-items:flex-start;padding:.7mm 0;border-bottom:.3mm solid #ccc}
  .irow:last-child{border-bottom:none}
  .inum{font-size:7.5pt;font-weight:900;color:#7A5800;flex-shrink:0;width:4mm}
  .iref{font-size:6.5pt;font-weight:700;color:#333;flex-shrink:0;width:15mm;padding-top:.2mm}
  .iinfo{flex:1;min-width:0}
  .ititle{font-size:8pt;font-weight:800;color:#000;line-height:1.3}
  .isub{font-size:6.5pt;font-weight:700;color:#333;margin-top:.2mm;line-height:1.3}
  .pbox{
    display:flex;justify-content:space-between;align-items:center;
    background:#FDF6DC;border-radius:1.5mm;
    border:.4mm solid #B8860B;
    padding:.8mm 2mm;margin-top:1mm;flex-shrink:0;
  }
  .plbl{font-size:7pt;color:#B8860B}
  .pval{font-size:11pt;font-weight:800;color:#B8860B}
`;

/* ── Etichetta singola — 62x100mm portrait ── */
function receiptHTML(r,c) {
  const qrUrl="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data="+encodeURIComponent(r.numero)+"&bgcolor=ffffff&color=000000&qzone=2&ecc=H";
  const hdr=(tag)=>`<div class="hdr"><img class="logo" src="${zerrilloLogo}" alt=""/><span class="copy">${tag}</span></div>`;
  /* Nome cliente in cima — primo dato leggibile */
  const custTop=c?`<div class="ctop"><div class="ctop-name">${c.nome} ${c.cognome}</div>${c.telefono?`<div class="ctop-phone">Tel. ${displayPhone(c)}</div>`:""}</div>`:`<div class="ctop"><div class="ctop-name">&mdash;</div></div>`;
  const qrRow=`<div class="qr-row"><img class="qr-img" src="${qrUrl}" alt=""/><div class="qr-text"><div class="num">${r.numero}</div><div class="dts">Ricevuto: ${fmtDate(r.dataRicevuta)}</div><div class="dts">Consegna: ${fmtDate(r.dataConsegna)||"Da definire"}</div></div></div>`;
  const objFull=`<div class="obj"><div class="sec">Oggetto</div><div class="ocat">${r.categoria}${r.tipoLavoro?" &middot; "+r.tipoLavoro:""}</div><div class="odesc">${r.descrizione}</div>${r.materiali?`<div class="omat">Materiali: ${r.materiali}</div>`:""}${r.mano?`<div class="omat">Mano ${r.mano} &middot; ${r.dito}</div>`:""}<div class="sec" style="margin-top:1.5mm">Lavoro richiesto</div><div class="oprob">${r.problema||"&mdash;"}</div>${r.richiestaPreventivo?`<div class="oprev-warn">⏳ Preventivo da richiedere al fornitore</div>`:""}${r.preventivo?`<div class="prev"><span class="prevl">Preventivo${r.preventivoAccettato?" ✓":""}</span><span class="prevv">${r.preventivo} &euro;</span></div>`:""}</div>`;
  const foot=`<div class="foot">${SHOP.nome} &middot; ${SHOP.indirizzo}, ${SHOP.citta} &middot; Tel. ${SHOP.tel}</div>`;
  const opNeg=r.operatore?`<div style="font-size:7pt;font-weight:700;color:#555;padding:.5mm 2mm 0">Ricevuta da: ${r.operatore}</div>`:"";
  const cliente=`<div class="label">${hdr("CLIENTE")}${custTop}<div class="div"></div>${qrRow}<div class="div"></div>${objFull}${foot}</div>`;
  const negozio=`<div class="label">${hdr("NEGOZIO")}${custTop}<div class="div"></div>${qrRow}<div class="div"></div>${objFull}${opNeg}${foot}</div>`;
  const riparatore=`<div class="label">${hdr("RIPARATORE")}${qrRow}<div class="div"></div>${objFull}${foot}</div>`;
  // eslint-disable-next-line no-useless-escape
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title><style>${LABEL_CSS}@media print{@page{size:62mm 100mm;margin:0}html,body{margin:0!important;padding:0!important;width:62mm!important}}<\/style><script>document.title="";<\/script></head><body>${cliente}${negozio}${riparatore}</body></html>`;
}


/* ── Multi-oggetto — 62x100mm portrait ── */
function multiReceiptHTML(repairs,c) {
  const first=repairs[0];
  const qrUrl0="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data="+encodeURIComponent(first.numero)+"&bgcolor=ffffff&color=000000&qzone=2&ecc=H";
  const hdr=(tag)=>`<div class="hdr"><img class="logo" src="${zerrilloLogo}" alt=""/><span class="copy">${tag}</span></div>`;
  const prevTot=repairs.reduce((s,r)=>s+(parseFloat(r.preventivo)||0),0);
  const hasRich=repairs.some(r=>r.richiestaPreventivo);
  const foot=`<div class="foot">${SHOP.nome} &middot; ${SHOP.indirizzo}, ${SHOP.citta} &middot; Tel. ${SHOP.tel}</div>`;
  const rows=repairs.map((r,i)=>{
    const sub=[r.categoria,r.tipoLavoro,r.mano?`Mano ${r.mano} ${r.dito}`:""].filter(Boolean).join(" · ");
    return `<div class="irow"><span class="inum">${i+1}</span><span class="iref">${r.numero}</span><div class="iinfo"><div class="ititle">${r.descrizione}</div><div class="isub">${sub}${r.richiestaPreventivo?" — ⏳ prev.":""}</div></div></div>`;
  }).join("");
  const custTop=c?`<div class="ctop"><div class="ctop-name">${c.nome} ${c.cognome}</div>${c?.telefono?`<div class="ctop-phone">Tel. ${displayPhone(c)}</div>`:""}</div>`:`<div class="ctop"><div class="ctop-name">&mdash;</div></div>`;
  const qrRow0=`<div class="qr-row"><img class="qr-img" src="${qrUrl0}" alt=""/><div class="qr-text"><div class="num">${first.numero}${repairs.length>1?" &hellip;":""}</div><div class="dts">Ricevuto: ${fmtDate(first.dataRicevuta)}</div><div class="dts">Consegna: ${fmtDate(first.dataConsegna)||"Da definire"}</div></div></div>`;
  const summaryBody=`${custTop}<div class="div"></div>${qrRow0}<div class="div"></div><div class="obj"><div class="sec">${repairs.length} oggetti in riparazione</div><div class="items">${rows}</div>${prevTot>0?`<div class="pbox"><span class="plbl">Preventivo totale${hasRich?" (parz.)":""}</span><span class="pval">${prevTot.toFixed(2)} &euro;</span></div>`:""}</div>${foot}`;
  const opNeg=first.operatore?`<div style="font-size:7pt;font-weight:700;color:#555;padding:.5mm 2mm 0">Ricevuta da: ${first.operatore}</div>`:"";
  const cliLabel=`<div class="label">${hdr("CLIENTE &middot; "+repairs.length+" OGG.")}${summaryBody}</div>`;
  const negLabel=`<div class="label">${hdr("NEGOZIO &middot; "+repairs.length+" OGG.")}${summaryBody}${opNeg}</div>`;
  const ripLabels=repairs.map((r,i)=>{
    const qri="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data="+encodeURIComponent(r.numero)+"&bgcolor=ffffff&color=000000&qzone=2&ecc=H";
    const qSi=`<div class="qr-row"><img class="qr-img" src="${qri}" alt=""/><div class="qr-text"><div class="num">${r.numero}</div><div class="dts">Ricevuto: ${fmtDate(r.dataRicevuta)}</div><div class="dts">Consegna: ${fmtDate(r.dataConsegna)||"Da definire"}</div></div></div>`;
    const oFull=`<div class="obj"><div class="sec">Oggetto ${i+1} di ${repairs.length}</div><div class="ocat">${r.categoria}${r.tipoLavoro?" &middot; "+r.tipoLavoro:""}</div><div class="odesc">${r.descrizione}</div>${r.materiali?`<div class="omat">Materiali: ${r.materiali}</div>`:""}${r.mano?`<div class="omat">Mano ${r.mano} &middot; ${r.dito}</div>`:""}<div class="sec" style="margin-top:1.5mm">Lavoro</div><div class="oprob">${r.problema||"&mdash;"}</div>${r.richiestaPreventivo?`<div class="oprev-warn">⏳ Preventivo da richiedere</div>`:""}${r.preventivo?`<div class="prev"><span class="prevl">Prev.${r.preventivoAccettato?" ✓":""}</span><span class="prevv">${r.preventivo} &euro;</span></div>`:""}</div>`;
    return `<div class="label">${hdr("RIPARATORE")}${qSi}<div class="div"></div>${oFull}${foot}</div>`;
  }).join("");
  // eslint-disable-next-line no-useless-escape
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title><style>${LABEL_CSS}@media print{@page{size:62mm 100mm;margin:0}html,body{margin:0!important;padding:0!important;width:62mm!important}}<\/style><script>document.title="";<\/script></head><body>${cliLabel}${negLabel}${ripLabels}</body></html>`;
}



/* ── Etichette Ordine — 62x100mm portrait ── */
function orderLabelHTML(order,c) {
  const qrUrl="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data="+encodeURIComponent(order.numero)+"&bgcolor=ffffff&color=000000&qzone=2&ecc=H";
  const hdr=(tag)=>`<div class="hdr"><img class="logo" src="${zerrilloLogo}" alt=""/><span class="copy">${tag}</span></div>`;
  const stato=ORDER_STATUSES[order.stato]?.label||order.stato||"—";
  const custTop=c?`<div class="ctop"><div class="ctop-name">${c.nome} ${c.cognome}</div>${c.telefono?`<div class="ctop-phone">Tel. ${displayPhone(c)}</div>`:""}</div>`:`<div class="ctop"><div class="ctop-name">&mdash;</div></div>`;
  const qrRow=`<div class="qr-row"><img class="qr-img" src="${qrUrl}" alt=""/><div class="qr-text"><div class="num">${order.numero}</div><div class="dts">Stato: ${stato}</div><div class="dts">Ordine: ${fmtDate(order.dataOrdine)||"—"}</div></div></div>`;
  const shown=order.prodotti.slice(0,4);
  const extra=order.prodotti.length-shown.length;
  const prodRows=shown.map(p=>`<div class="irow"><div class="iinfo"><div class="ititle">${p.quantita>1?p.quantita+"× ":""}${p.descrizione}</div>${p.categoria||p.fornitore?`<div class="isub">${[p.categoria,p.fornitore].filter(Boolean).join(" · ")}</div>`:""}${p.dataConsegnaPrevista?`<div class="isub">Cons: ${fmtDate(p.dataConsegnaPrevista)}</div>`:""}${p.note?`<div class="isub" style="font-style:italic">${p.note}</div>`:""}</div>${p.prezzoVendita?`<div style="font-size:7.5pt;font-weight:800;color:#B8860B;white-space:nowrap;flex-shrink:0">${p.prezzoVendita} &euro;</div>`:""}</div>`).join("");
  const extraRow=extra>0?`<div style="font-size:6.5pt;color:#888;padding:.4mm 0">+ altri ${extra} articoli…</div>`:"";
  const totAccontoLabel=order.prodotti.reduce((a,p)=>a+(parseFloat(p.acconto)||0),0);
  const accontoRow=totAccontoLabel>0?`<div class="prev"><span class="prevl">Acconto versato</span><span class="prevv">${totAccontoLabel.toFixed(2)} &euro;</span></div>`:"";
  const objSec=`<div class="obj"><div class="sec">Articoli ordinati</div><div class="items">${prodRows}${extraRow}</div>${accontoRow}</div>`;
  const foot=`<div class="foot">${SHOP.nome} &middot; ${SHOP.indirizzo}, ${SHOP.citta} &middot; Tel. ${SHOP.tel}</div>`;
  const cliente=`<div class="label">${hdr("CLIENTE")}${custTop}<div class="div"></div>${qrRow}<div class="div"></div>${objSec}${foot}</div>`;
  const negozio=`<div class="label">${hdr("NEGOZIO")}${custTop}<div class="div"></div>${qrRow}<div class="div"></div>${objSec}${foot}</div>`;
  // eslint-disable-next-line no-useless-escape
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title><style>${LABEL_CSS}@media print{@page{size:62mm 100mm;margin:0}html,body{margin:0!important;padding:0!important;width:62mm!important}}<\/style><script>document.title="";<\/script></head><body>${cliente}${negozio}</body></html>`;
}

/* ── DDT HTML ── */
function ddtHTML(ddt,items) {
  const rows=items.map((r,i)=>`<tr><td>${i+1}</td><td><b>${r.numero}</b></td><td>${r.categoria}</td><td>${r.descrizione}</td><td>${r.problema||"—"}</td>${r.richiestaPreventivo?"<td style='color:#7C3AED;font-weight:600'>⏳ Richiesto</td>":"<td>—</td>"}</tr>`).join("");
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>DDT ${ddt.numero}</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,Arial,sans-serif;padding:28px;font-size:12px;color:#1c1c1e}
    /* Intestazione DDT */
    .ddt-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #B8860B;padding-bottom:14px;margin-bottom:18px;gap:20px}
    .shop-block .shop-info{font-size:10px;color:#555;line-height:1.8}
    .ddt-title-block{text-align:right}
    .ddt-title-block h2{font-size:20px;font-weight:800;letter-spacing:-.5px;color:#1c1c1e}
    .ddt-title-block .ddt-meta{font-size:11px;color:#555;margin-top:4px;line-height:1.8}
    /* Sezioni */
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:14px 0}
    .box{border:1px solid #E5E5EA;border-radius:8px;padding:10px}
    .box-t{font-weight:700;font-size:10px;color:#8E8E93;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
    .box b{font-size:12px;display:block;margin-bottom:2px}
    .box span{font-size:11px;color:#555;display:block;line-height:1.6}
    /* Tabella */
    table{width:100%;border-collapse:collapse;margin-top:14px}
    th{background:#F2F2F7;padding:7px 8px;text-align:left;border:1px solid #E5E5EA;font-size:11px;font-weight:700}
    td{padding:6px 8px;border:1px solid #F2F2F7;font-size:11px}
    tr:nth-child(even){background:#F9F9FB}
    /* Firme */
    .sigs{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:40px}
    .sig{border-top:1px solid #1c1c1e;padding-top:6px;font-size:11px;color:#8E8E93;text-align:center}
    /* Footer */
    .footer{margin-top:30px;padding-top:10px;border-top:1px solid #E5E5EA;font-size:9px;color:#aaa;text-align:center;line-height:1.8}
  </style></head><body>

    <div class="ddt-header">
      <div class="shop-block">
        <img src="${zerrilloLogo}" alt="${SHOP.nome}" style="height:20mm;width:auto;object-fit:contain;display:block;margin-bottom:6px"/>
        <div class="shop-info">
          ${SHOP.indirizzo}, ${SHOP.citta}<br>
          Tel./Fax: ${SHOP.tel}<br>
          PEC: ${SHOP.pec}<br>
          ${SHOP.email} · ${SHOP.web}<br>
          P.I. / C.F.: ${SHOP.piva} · SDI: ${SHOP.sdi}
        </div>
      </div>
      <div class="ddt-title-block">
        <h2>DOCUMENTO DI TRASPORTO</h2>
        <div class="ddt-meta">
          <b>N° DDT:</b> ${ddt.numero}<br>
          <b>Data:</b> ${fmtDate(ddt.data)}<br>
          <b>N° oggetti:</b> ${items.length} pz.
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="box">
        <div class="box-t">Mittente</div>
        <b>${SHOP.nome}</b>
        <span>${SHOP.indirizzo}, ${SHOP.citta}</span>
        <span>Tel. ${SHOP.tel}</span>
        <span>P.I. ${SHOP.piva}</span>
      </div>
      <div class="box">
        <div class="box-t">Destinatario / Riparatore</div>
        <b>${ddt.riparatore.nome}</b>
        ${ddt.riparatore.indirizzo?`<span>${ddt.riparatore.indirizzo}</span>`:""}
        ${(ddt.riparatore.cap||ddt.riparatore.citta||ddt.riparatore.provincia)?`<span>${[ddt.riparatore.cap,ddt.riparatore.citta,ddt.riparatore.provincia?`(${ddt.riparatore.provincia})`:null].filter(Boolean).join(" ")}</span>`:""}
        ${ddt.riparatore.piva?`<span>P.IVA: ${ddt.riparatore.piva}</span>`:""}
        ${ddt.riparatore.telefono?`<span>Tel. ${ddt.riparatore.telefono}</span>`:""}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Riparazione</th>
          <th>Categoria</th>
          <th>Descrizione</th>
          <th>Problema / Lavoro</th>
          <th>Preventivo</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    ${(()=>{const t=ddt.riparatore?.trasporto;if(!t)return"";return`
    <div style="margin-top:16px;border:1px solid #E5E5EA;border-radius:8px;overflow:hidden">
      <div style="background:#F2F2F7;padding:6px 10px;font-size:10px;font-weight:700;color:#8E8E93;text-transform:uppercase;letter-spacing:.5px">Dati trasporto</div>
      <table style="width:100%;border-collapse:collapse;margin:0">
        <tr>
          <td style="padding:5px 10px;font-size:10px;font-weight:700;color:#555;width:25%;border-right:1px solid #F2F2F7;border-bottom:1px solid #F2F2F7">Causale</td>
          <td style="padding:5px 10px;font-size:11px;border-bottom:1px solid #F2F2F7">${t.causale||"—"}</td>
          <td style="padding:5px 10px;font-size:10px;font-weight:700;color:#555;width:25%;border-right:1px solid #F2F2F7;border-bottom:1px solid #F2F2F7;border-left:1px solid #F2F2F7">Porto</td>
          <td style="padding:5px 10px;font-size:11px;border-bottom:1px solid #F2F2F7">${t.portoFranco||"—"}</td>
        </tr>
        <tr>
          <td style="padding:5px 10px;font-size:10px;font-weight:700;color:#555;border-right:1px solid #F2F2F7;border-bottom:1px solid #F2F2F7">Aspetto beni</td>
          <td style="padding:5px 10px;font-size:11px;border-bottom:1px solid #F2F2F7">${t.aspettoBeni||"—"}</td>
          <td style="padding:5px 10px;font-size:10px;font-weight:700;color:#555;border-right:1px solid #F2F2F7;border-bottom:1px solid #F2F2F7;border-left:1px solid #F2F2F7">Vettore</td>
          <td style="padding:5px 10px;font-size:11px;border-bottom:1px solid #F2F2F7">${t.vettore||"—"}</td>
        </tr>
        <tr>
          <td style="padding:5px 10px;font-size:10px;font-weight:700;color:#555;border-right:1px solid #F2F2F7">N. colli</td>
          <td style="padding:5px 10px;font-size:11px">${t.nColli||"—"}</td>
          <td style="padding:5px 10px;font-size:10px;font-weight:700;color:#555;border-right:1px solid #F2F2F7;border-left:1px solid #F2F2F7">Peso lordo</td>
          <td style="padding:5px 10px;font-size:11px">${t.peso?t.peso+" kg":"—"}</td>
        </tr>
      </table>
      <div style="padding:5px 10px;font-size:10px;color:#555;border-top:1px solid #F2F2F7"><b>Inizio trasporto:</b> ${t.dataInizio?fmtDate(t.dataInizio)+(t.oraInizio?" ore "+t.oraInizio:""):"—"}</div>
    </div>`;})()}

    ${ddt.note?`<p style="margin-top:14px;font-size:11px;color:#444"><b>Note:</b> ${ddt.note}</p>`:""}

    <div class="sigs">
      <div class="sig">Firma Mittente</div>
      <div class="sig">Firma / Timbro Destinatario</div>
    </div>

    <div class="footer">
      ${SHOP.nome} · ${SHOP.indirizzo}, ${SHOP.citta} · P.I. ${SHOP.piva} · SDI: ${SHOP.sdi}
    </div>

  </body></html>`;
}

/* ── PIN ── */
/* ── Breakpoint hook ── */
const BP=768;
function useW(){const [w,setW]=useState(()=>window.innerWidth);useEffect(()=>{const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);return w;}

function PinScreen({onUnlock}) {
  const PIN=process.env.REACT_APP_PIN||"1234";
  const [val,setVal]=useState(""); const [err,setErr]=useState(false);
  const check=()=>{if(val===PIN)onUnlock();else{setErr(true);setVal("");}};
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"#F2F2F7",fontFamily:"-apple-system,sans-serif",gap:20}}>
      <img src={zerrilloLogo} alt="Zerrillo preziosi" style={{height:90,width:"auto",objectFit:"contain"}}/>
      <div style={{fontSize:14,color:C.secondary,fontWeight:600,letterSpacing:1}}>REPAIR MANAGER</div>
      <input type="password" maxLength={6} value={val} onChange={e=>{setVal(e.target.value);setErr(false);}} onKeyDown={e=>e.key==="Enter"&&check()} placeholder="PIN di accesso" autoFocus style={{textAlign:"center",fontSize:22,letterSpacing:8,padding:"14px 20px",borderRadius:16,border:err?"2px solid #FF3B30":"2px solid transparent",boxShadow:"0 2px 12px rgba(0,0,0,.1)",outline:"none",width:220,background:"white"}}/>
      {err&&<div style={{color:C.red,fontSize:14,fontWeight:600}}>PIN non corretto</div>}
      <button onClick={check} style={{background:"linear-gradient(135deg,#C9A227,#B8860B)",color:"white",border:"none",borderRadius:16,padding:"15px 50px",fontSize:17,fontWeight:700,cursor:"pointer"}}>Entra</button>
    </div>
  );
}

/* ── UI Primitives ── */
function IOSCard({children,style={}}) { return <div style={{background:C.white,borderRadius:16,boxShadow:"0 1px 3px rgba(0,0,0,.08)",...style}}>{children}</div>; }

function IOSRow({icon,label,value,sub,onPress,last=false,chevron=false}) {
  const Tag=onPress?"button":"div";
  const hasValue=value!==undefined&&value!==null&&value!=="";
  return (
    <Tag onClick={onPress} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"11px 16px",width:"100%",textAlign:"left",background:"transparent",border:"none",cursor:onPress?"pointer":"default",borderBottom:last?"none":"1px solid #F2F2F7",boxSizing:"border-box"}}>
      {icon&&(typeof icon==="string"?<span style={{fontSize:19,width:26,textAlign:"center",flexShrink:0,marginTop:1}}>{icon}</span>:<span style={{flexShrink:0}}>{icon}</span>)}
      <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
        <div style={{fontSize:13,color:C.secondary,fontWeight:500,marginBottom:hasValue?2:0}}>{label}</div>
        {hasValue&&<div style={{fontSize:15,color:C.label,wordBreak:"break-word",whiteSpace:"pre-wrap"}}>{value}</div>}
        {sub&&<div style={{fontSize:13,color:C.secondary,marginTop:2,wordBreak:"break-word"}}>{sub}</div>}
      </div>
      {chevron&&<svg width="14" height="14" fill="none" stroke={C.separator} strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24" style={{flexShrink:0,marginTop:3}}><path d="M9 5l7 7-7 7"/></svg>}
    </Tag>
  );
}

function WABtn({customer,size=30}) {
  const phone=fullPhone(customer);
  if(!phone)return null;
  return (
    <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"
       onClick={e=>e.stopPropagation()}
       style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:size,height:size,borderRadius:size/2,background:"#DCFCE7",color:"#16A34A",fontSize:size*0.52,textDecoration:"none",flexShrink:0,border:"none",cursor:"pointer"}}>
      💬
    </a>
  );
}

function Btn({label,variant="primary",disabled=false,onClick,full=false,small=false}) {
  const bg={primary:"linear-gradient(135deg,#C9A227,#B8860B)",secondary:C.surface,green:C.green,purple:C.purple,red:C.red,orange:C.orange}[variant];
  const col={primary:"#fff",secondary:C.blue,green:"#fff",purple:"#fff",red:"#fff",orange:"#fff"}[variant];
  return <button onClick={onClick} disabled={disabled} style={{background:bg,color:col,border:"none",borderRadius:14,padding:small?"9px 16px":"14px 20px",fontSize:small?13:16,fontWeight:600,opacity:disabled?.4:1,cursor:disabled?"not-allowed":"pointer",fontFamily:"-apple-system,sans-serif",width:full?"100%":"auto",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6}}>{label}</button>;
}

function IOSBadge({status}) {
  const s=STATUSES[status]||STATUSES.ricevuto;
  return <span style={{background:s.bg,color:s.color,fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,whiteSpace:"nowrap"}}>{s.label}</span>;
}

function IOSInput({label,...props}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {label&&<div style={{fontSize:13,fontWeight:600,color:C.secondary}}>{label}</div>}
      <input style={{background:C.white,border:"none",borderRadius:12,padding:"12px 14px",fontSize:16,color:C.label,fontFamily:"-apple-system,sans-serif",outline:"none",boxShadow:"0 1px 3px rgba(0,0,0,.07)",width:"100%",boxSizing:"border-box"}} {...props}/>
    </div>
  );
}

function IOSTextarea({label,...props}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {label&&<div style={{fontSize:13,fontWeight:600,color:C.secondary}}>{label}</div>}
      <textarea style={{background:C.white,border:"none",borderRadius:12,padding:"12px 14px",fontSize:16,color:C.label,fontFamily:"-apple-system,sans-serif",outline:"none",resize:"none",height:90,boxShadow:"0 1px 3px rgba(0,0,0,.07)",width:"100%",boxSizing:"border-box"}} {...props}/>
    </div>
  );
}

function PhoneInput({prefisso,telefono,onPrefisso,onTelefono}) {
  return (
    <div style={{display:"flex",gap:8}}>
      <select value={prefisso||"+39"} onChange={e=>onPrefisso(e.target.value)} style={{background:C.white,border:"none",borderRadius:12,padding:"12px 10px",fontSize:14,fontFamily:"-apple-system,sans-serif",outline:"none",boxShadow:"0 1px 3px rgba(0,0,0,.07)",width:82,flexShrink:0}}>
        {PREFIXES.map(p=><option key={p} value={p}>{p}</option>)}
      </select>
      <input type="tel" value={telefono||""} onChange={e=>onTelefono(e.target.value.replace(/\D/g,""))} placeholder="3331234567" style={{flex:1,background:C.white,border:"none",borderRadius:12,padding:"12px 14px",fontSize:16,color:C.label,fontFamily:"-apple-system,sans-serif",outline:"none",boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}/>
    </div>
  );
}

function SectionTitle({children}) { return <div style={{fontSize:13,fontWeight:600,color:C.secondary,textTransform:"uppercase",letterSpacing:".5px",margin:"20px 0 8px 4px"}}>{children}</div>; }

function Toggle({label,value,onChange,sub}) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:C.white,borderRadius:12,padding:"12px 16px",boxShadow:"0 1px 3px rgba(0,0,0,.07)",gap:12}}>
      <div style={{flex:1}}>
        <div style={{fontSize:15,color:C.label,fontWeight:500}}>{label}</div>
        {sub&&<div style={{fontSize:12,color:C.secondary,marginTop:2}}>{sub}</div>}
      </div>
      <div onClick={()=>onChange(!value)} style={{width:51,height:31,borderRadius:16,background:value?C.green:"#E5E5EA",cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
        <div style={{position:"absolute",top:2,left:value?22:2,width:27,height:27,borderRadius:14,background:"white",boxShadow:"0 2px 4px rgba(0,0,0,.2)",transition:"left .2s"}}/>
      </div>
    </div>
  );
}

function FullScreen({children,onClose,title,step,totalSteps}) {
  const isMD=useW()>=BP;
  const inner=(
    <div style={{background:C.surface,width:isMD?"min(720px,90vw)":"100%",maxHeight:isMD?"92vh":"100%",borderRadius:isMD?20:0,display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:isMD?"0 24px 64px rgba(0,0,0,.35)":"none",flexShrink:0}}>
      <div style={{background:"rgba(242,242,247,.96)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(0,0,0,.08)",padding:"14px 16px 12px",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:step?12:0}}>
          <button onClick={onClose} style={{fontSize:15,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"-apple-system,sans-serif"}}>✕ Annulla</button>
          <div style={{fontSize:17,fontWeight:700,color:C.label}}>{title}</div>
          <div style={{width:80}}/>
        </div>
        {step&&(
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{flex:1,height:4,background:"#E5E5EA",borderRadius:2,overflow:"hidden"}}>
              <div style={{height:"100%",width:(((step-1)/(totalSteps-1))*100)+"%",background:"linear-gradient(90deg,#C9A227,#B8860B)",borderRadius:2,transition:"width .35s"}}/>
            </div>
            <div style={{fontSize:12,color:C.secondary,fontWeight:600,whiteSpace:"nowrap"}}>Step {step} di {totalSteps}</div>
          </div>
        )}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"20px 16px 40px"}}>{children}</div>
    </div>
  );
  if(isMD) return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"-apple-system,sans-serif"}}>
      {inner}
    </div>
  );
  return (
    <div style={{position:"fixed",inset:0,background:C.surface,zIndex:100,display:"flex",flexDirection:"column",fontFamily:"-apple-system,sans-serif"}}>
      {inner}
    </div>
  );
}

function Sheet({children,onClose,title,footer}) {
  const isMD=useW()>=BP;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:100,display:"flex",alignItems:isMD?"center":"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:C.surface,width:"100%",maxWidth:600,borderRadius:isMD?20:"20px 20px 0 0",maxHeight:isMD?"85vh":"94vh",display:"flex",flexDirection:"column",fontFamily:"-apple-system,sans-serif",boxShadow:isMD?"0 24px 64px rgba(0,0,0,.3)":"none"}} onClick={e=>e.stopPropagation()}>
        <div style={{flexShrink:0,background:"rgba(242,242,247,.96)",backdropFilter:"blur(12px)",borderBottom:"1px solid rgba(0,0,0,.06)",padding:"14px 16px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{width:60}}/>
          <div style={{fontSize:17,fontWeight:700,color:C.label}}>{title}</div>
          <button onClick={onClose} style={{width:60,textAlign:"right",fontSize:17,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"-apple-system,sans-serif"}}>Chiudi</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"16px 16px 0",paddingBottom:footer?8:isMD?24:34}}>{children}</div>
        {footer&&<div style={{flexShrink:0,borderTop:"1px solid rgba(0,0,0,.08)",padding:"12px 16px",paddingBottom:isMD?16:34,background:"rgba(242,242,247,.96)",backdropFilter:"blur(12px)"}}>{footer}</div>}
      </div>
    </div>
  );
}

/* ── WAToast ── */
function WAToast({repair,customer,onDismiss,customMsg,label,isMD}) {
  const msg=customMsg||`Gentile ${customer.nome} ${customer.cognome},\nla sua riparazione n° ${repair.numero} è pronta per il ritiro.${repair.prezzoFinale?`\n\nImporto da saldare: ${repair.prezzoFinale} €`:""}\n\n${SHOP.nome}\n${SHOP.indirizzo}, ${SHOP.citta}\nTel. ${SHOP.tel}`;
  const phone=fullPhone(customer);
  return (
    <div style={{position:"fixed",bottom:isMD?24:90,left:isMD?"50%":"50%",transform:"translateX(-50%)",width:"calc(100% - 32px)",maxWidth:560,background:"#1C1C1E",borderRadius:18,padding:"14px 16px",zIndex:200,display:"flex",alignItems:"center",gap:12,boxShadow:"0 8px 32px rgba(0,0,0,.4)",fontFamily:"-apple-system,sans-serif"}}>
      <span style={{fontSize:28,flexShrink:0}}>✅</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:700,color:"white",marginBottom:2}}>{label==="📄 Invia ricevuta"?"Consegnato!":customMsg?"Preventivo accettato!":repair.numero+" è pronto!"}</div>
        <div style={{fontSize:12,color:"rgba(255,255,255,.6)"}}>{customer.nome} {customer.cognome}</div>
      </div>
      {phone&&<button onClick={()=>{window.open("https://wa.me/"+phone+"?text="+encodeURIComponent(msg),"_blank");onDismiss();}} style={{background:"#25D366",border:"none",borderRadius:12,padding:"8px 14px",color:"white",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>{label||"💬 WhatsApp"}</button>}
      <button onClick={onDismiss} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:10,padding:"8px 10px",color:"white",fontSize:13,cursor:"pointer",flexShrink:0}}>✕</button>
    </div>
  );
}

/* ── RepairCard ── */
function RepairCard({repair:r,customer:c,ddt,onPress,onReceipt}) {
  const isOverdue=r.status!=="consegnato"&&r.status!=="pronto"&&r.dataConsegna&&r.dataConsegna<today();
  const catIcon=CATS.find(x=>x.id===r.categoria)?.icon||"💍";
  const extraItems=r.items?.length;
  const hasFlags=isOverdue||r.richiestaPreventivo||r.preventivoAccettato||r.riparazioneInterna||extraItems>0||ddt;
  return (
    <div style={{width:"100%",background:C.white,borderRadius:20,padding:"14px 16px",boxShadow:"0 1px 4px rgba(0,0,0,.07)",display:"flex",gap:12,alignItems:"flex-start",marginBottom:10,cursor:"pointer"}} onClick={onPress}>
      <div style={{width:44,height:44,borderRadius:22,background:STATUSES[r.status]?.bg||"#EFF6FF",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{catIcon}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
          <span style={{fontSize:14,fontWeight:700,color:C.label}}>{r.numero}</span>
          <IOSBadge status={r.status}/>
        </div>
        {hasFlags&&(
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:5}}>
            {isOverdue&&<span style={{fontSize:11,background:"#FFF1F2",color:C.red,padding:"2px 7px",borderRadius:8,fontWeight:600}}>⚠️ In ritardo</span>}
            {r.riparazioneInterna&&<span style={{fontSize:11,background:"#FFF7ED",color:"#C2410C",padding:"2px 7px",borderRadius:8,fontWeight:600}}>🏠 Interna</span>}
            {r.richiestaPreventivo&&<span style={{fontSize:11,background:"#F5F3FF",color:C.purple,padding:"2px 7px",borderRadius:8,fontWeight:600}}>⏳ Prev. fornitore</span>}
            {r.preventivoAccettato&&<span style={{fontSize:11,background:"#ECFDF5",color:C.green,padding:"2px 7px",borderRadius:8,fontWeight:600}}>✅ Accettato</span>}
            {extraItems>0&&<span style={{fontSize:11,background:"#EFF6FF",color:"#1D4ED8",padding:"2px 7px",borderRadius:8,fontWeight:600}}>+{extraItems} oggetti</span>}
            {ddt&&<span style={{fontSize:11,background:"#F5F3FF",color:C.purple,padding:"2px 7px",borderRadius:8,fontWeight:500}}>{ddt.numero}</span>}
          </div>
        )}
        <div style={{fontSize:14,color:C.label,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>{r.descrizione}</div>
        <div style={{fontSize:12,color:C.secondary,display:"flex",gap:10,flexWrap:"wrap"}}>
          {c&&<span>👤 {c.nome} {c.cognome}</span>}
          {r.dataConsegna&&<span>📅 {fmtDate(r.dataConsegna)}</span>}
          {r.prezzoFinale?<span>💰 {r.prezzoFinale} €</span>:r.preventivo?<span>💰 {r.preventivo} €</span>:null}
        </div>
      </div>
      <button onClick={e=>{e.stopPropagation();onReceipt(r,c);}} style={{flexShrink:0,background:"#FDF6DC",border:"none",borderRadius:10,width:36,height:36,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",marginTop:2}}>🧾</button>
    </div>
  );
}

/* ── Ring Detail Modal ── */
function RingDetailModal({form,set,onConfirm,onSkip}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#F2F2F7",borderRadius:24,padding:24,width:"100%",maxWidth:380,fontFamily:"-apple-system,sans-serif"}}>
        <div style={{fontSize:20,fontWeight:800,color:C.label,marginBottom:6}}>💍 Dettagli anello</div>
        <div style={{fontSize:14,color:C.secondary,marginBottom:20}}>Specifica per quale dito è il ridimensionamento</div>
        <div style={{fontSize:13,fontWeight:600,color:C.secondary,marginBottom:8}}>MANO</div>
        <div style={{display:"flex",gap:10,marginBottom:16}}>
          {["Destra","Sinistra"].map(m=>(
            <button key={m} onClick={()=>set("mano",m)} style={{flex:1,padding:12,borderRadius:14,border:"none",background:form.mano===m?"linear-gradient(135deg,#C9A227,#B8860B)":"white",color:form.mano===m?"white":C.label,fontWeight:700,fontSize:15,cursor:"pointer",boxShadow:"0 1px 3px rgba(0,0,0,.08)"}}>{m}</button>
          ))}
        </div>
        <div style={{fontSize:13,fontWeight:600,color:C.secondary,marginBottom:8}}>DITO</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:20}}>
          {DITA.map(d=>(
            <button key={d} onClick={()=>set("dito",d)} style={{padding:11,borderRadius:12,border:"none",background:form.dito===d?"linear-gradient(135deg,#C9A227,#B8860B)":"white",color:form.dito===d?"white":C.label,fontWeight:600,fontSize:14,cursor:"pointer",boxShadow:"0 1px 3px rgba(0,0,0,.08)"}}>{d}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onSkip} style={{flex:1,padding:14,borderRadius:14,border:"none",background:"#E5E5EA",color:C.secondary,fontWeight:600,fontSize:15,cursor:"pointer"}}>Salta</button>
          <button onClick={onConfirm} style={{flex:1,padding:14,borderRadius:14,border:"none",background:"linear-gradient(135deg,#C9A227,#B8860B)",color:"white",fontWeight:700,fontSize:15,cursor:"pointer"}}>Avanti →</button>
        </div>
      </div>
    </div>
  );
}

/* ── Wizard ── */
function RepairWizard({customers,onSave,onClose,onAddedCustomer}) {
  const TOTAL=7;
  const [step,setStep]=useState(0);
  const [form,setForm]=useState({operatore:"",customerId:"",categoria:"",tipoLavoro:"",descrizione:"",materiali:"",problema:"",preventivo:"",preventivoAccettato:false,richiestaPreventivo:false,riparazioneInterna:false,dataConsegna:"",note:"",fotoUrl:"",fotoBlob:null,mano:"",dito:"",items:[]});
  const [search,setSearch]=useState("");
  const [showNew,setShowNew]=useState(false);
  const [newC,setNewC]=useState({nome:"",cognome:"",telefono:"",telefonoPrefisso:"+39",email:"",codiceFiscale:""});
  const [docB64,setDocB64]=useState(null); const [docMsg,setDocMsg]=useState(""); const [docLoad,setDocLoad]=useState(false);
  const [aiLoad,setAiLoad]=useState(false); const [aiMsg,setAiMsg]=useState("");
  const [imgPreview,setImgPreview]=useState(null);
  const [showRingDetail,setShowRingDetail]=useState(false);
  const [favCats,setFavCats]=useState(()=>{try{return JSON.parse(localStorage.getItem("favCats")||"[]");}catch{return [];}});
  const docRef=useRef(); const fotoRef=useRef();
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const selC=customers.find(c=>c.id===form.customerId);
  const filtered=customers.filter(c=>matchCustomer(c,search));

  const toggleFavCat=(id)=>{const n=favCats.includes(id)?favCats.filter(x=>x!==id):[...favCats,id];setFavCats(n);localStorage.setItem("favCats",JSON.stringify(n));};

  const scanDoc=async()=>{
    if(!docB64)return;setDocLoad(true);setDocMsg("");
    const res=await aiCall('Analizza documento d\'identità italiano. SOLO JSON: {"nome":"","cognome":"","codiceFiscale":"","indirizzo":""}',docB64);
    if(!res){setDocMsg("⚠️ AI non configurata");setDocLoad(false);return;}
    try{const j=JSON.parse(res.replace(/```json|```/g,"").trim());setNewC(c=>({...c,nome:j.nome||c.nome,cognome:j.cognome||c.cognome,codiceFiscale:j.codiceFiscale||c.codiceFiscale}));setDocMsg("✅ Dati estratti");}
    catch{setDocMsg("⚠️ Inserisci manualmente");}
    setDocLoad(false);
  };

  const catalogAI=async()=>{
    setAiLoad(true);setAiMsg("");
    const b64=imgPreview?imgPreview.split(",")[1]:null;
    const res=await aiCall(`Sei un esperto gioielliere. ${b64?"Analizza questa immagine":`Analizza: "${form.descrizione}"`} rispondi SOLO con JSON: {"descrizione":"","materiali":"","problema":""}`,b64);
    if(!res){setAiMsg("⚠️ AI non configurata");setAiLoad(false);return;}
    try{const j=JSON.parse(res.replace(/```json|```/g,"").trim());setForm(f=>({...f,...Object.fromEntries(Object.entries(j).filter(([,v])=>v))}));setAiMsg("✅ Suggerimenti AI applicati");}
    catch{setAiMsg("⚠️ Riprova");}
    setAiLoad(false);
  };

  const handleFoto=async(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    const blob=await compressImage(file,800);
    const url=URL.createObjectURL(blob);
    setImgPreview(url);set("fotoBlob",blob);set("fotoUrl",url);
  };

  const addCurrentItem=()=>{
    const item={categoria:form.categoria,tipoLavoro:form.tipoLavoro,descrizione:form.descrizione,materiali:form.materiali,problema:form.problema,mano:form.mano,dito:form.dito};
    setForm(f=>({...f,items:[...(f.items||[]),item],categoria:"",tipoLavoro:"",descrizione:"",materiali:"",problema:"",mano:"",dito:""}));
    setStep(2);
  };

  const stepTitles=["","👤 Cliente","💎 Oggetto","🔧 Tipo lavoro","📝 Descrizione","🔍 Problema","💰 Preventivo","✅ Riepilogo"];

  const OPERATORS=[
    {id:"Adri",  label:"Adri",  color:"#7C3AED", bg:"#F3EFFE"},
    {id:"Massi", label:"Massi", color:"#2563EB", bg:"#EFF6FF"},
    {id:"Jenny", label:"Jenny", color:"#DB2777", bg:"#FDF2F8"},
    {id:"Manu",  label:"Manu",  color:"#059669", bg:"#ECFDF5"},
  ];

  return (
    <FullScreen onClose={onClose} title={step===0?"👷 Operatore":stepTitles[step]} step={step||undefined} totalSteps={TOTAL}>
      {showRingDetail&&<RingDetailModal form={form} set={set} onSkip={()=>{setShowRingDetail(false);setStep(4);}} onConfirm={()=>{setShowRingDetail(false);setStep(4);}}/>}

      {/* STEP 0 — Operatore */}
      {step===0&&<div>
        <div style={{fontSize:24,fontWeight:800,color:C.label,marginBottom:6}}>Chi prende la riparazione?</div>
        <div style={{fontSize:15,color:C.secondary,marginBottom:28}}>Seleziona l'operatore</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:32}}>
          {OPERATORS.map(op=>{
            const sel=form.operatore===op.id;
            return (
              <button key={op.id} onClick={()=>set("operatore",op.id)} style={{background:sel?op.color:op.bg,border:sel?`2px solid ${op.color}`:"2px solid transparent",borderRadius:20,padding:"28px 16px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:12,transition:"all .2s",boxShadow:sel?`0 6px 20px ${op.color}44`:"0 1px 4px rgba(0,0,0,.08)"}}>
                <div style={{width:64,height:64,borderRadius:32,background:sel?"rgba(255,255,255,.25)":op.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:900,color:"white",letterSpacing:-1}}>
                  {op.label[0]}
                </div>
                <div style={{fontSize:18,fontWeight:700,color:sel?"white":op.color}}>{op.label}</div>
              </button>
            );
          })}
        </div>
        <Btn label="Avanti →" disabled={!form.operatore} full onClick={()=>setStep(1)}/>
      </div>}

      {/* STEP 1 */}
      {step===1&&<div>
        <div style={{fontSize:24,fontWeight:800,color:C.label,marginBottom:6}}>Chi è il cliente?</div>
        <div style={{fontSize:15,color:C.secondary,marginBottom:20}}>Cerca tra i clienti o aggiungine uno nuovo</div>
        <IOSInput placeholder="🔍  Cerca per nome o telefono…" value={search} onChange={e=>setSearch(e.target.value)} autoFocus/>
        <div style={{height:12}}/>
        {!showNew&&<button onClick={()=>setShowNew(true)} style={{width:"100%",border:"2px dashed #C9A227",borderRadius:16,padding:14,background:"#FDF6DC",color:"#B8860B",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"-apple-system,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:14}}><span style={{fontSize:22}}>➕</span> Aggiungi nuovo cliente</button>}
        {showNew&&(
          <IOSCard style={{marginBottom:14}}>
            <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
              <div style={{fontSize:16,fontWeight:700,color:C.label}}>Nuovo cliente</div>
              {aiEnabled&&(
                <div style={{background:"#F0F4FF",borderRadius:12,padding:12}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#3B5EDB",marginBottom:8}}>🤖 Scansione documento</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>docRef.current.click()} style={{flex:1,border:"1px solid #C7D2FE",borderRadius:10,padding:9,background:"white",color:"#3B5EDB",fontSize:13,fontWeight:600,cursor:"pointer"}}>{docB64?"📄 ✓":"📷 Carica doc"}</button>
                    <button onClick={scanDoc} disabled={!docB64||docLoad} style={{flex:1,background:"#3B5EDB",color:"white",border:"none",borderRadius:10,padding:9,fontSize:13,fontWeight:600,cursor:"pointer",opacity:(!docB64||docLoad)?.4:1}}>{docLoad?"⏳…":"🔍 Leggi"}</button>
                  </div>
                  <input ref={docRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>setDocB64(ev.target.result.split(",")[1]);r.readAsDataURL(f);}}/>
                  {docMsg&&<div style={{fontSize:12,color:"#3B5EDB",marginTop:6}}>{docMsg}</div>}
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <IOSInput placeholder="Nome *" value={newC.nome} onChange={e=>setNewC(c=>({...c,nome:e.target.value}))}/>
                <IOSInput placeholder="Cognome *" value={newC.cognome} onChange={e=>setNewC(c=>({...c,cognome:e.target.value}))}/>
              </div>
              <div><div style={{fontSize:13,fontWeight:600,color:C.secondary,marginBottom:6}}>Telefono</div><PhoneInput prefisso={newC.telefonoPrefisso} telefono={newC.telefono} onPrefisso={v=>setNewC(c=>({...c,telefonoPrefisso:v}))} onTelefono={v=>setNewC(c=>({...c,telefono:v}))}/></div>
              <IOSInput placeholder="Email" type="email" value={newC.email||""} onChange={e=>setNewC(c=>({...c,email:e.target.value}))}/>
              <IOSInput placeholder="Codice Fiscale" value={newC.codiceFiscale||""} onChange={e=>setNewC(c=>({...c,codiceFiscale:e.target.value.toUpperCase()}))}/>
              <div style={{display:"flex",gap:8}}>
                <Btn label="Annulla" variant="secondary" full onClick={()=>setShowNew(false)}/>
                <Btn label="Aggiungi →" full disabled={!newC.nome||!newC.cognome} onClick={()=>onAddedCustomer({...newC,id:uid()},(id)=>{set("customerId",id);setStep(2);setShowNew(false);})}/>
              </div>
            </div>
          </IOSCard>
        )}
        {filtered.length>0&&<IOSCard>{filtered.slice(0,10).map((c,i,arr)=>(
          <button key={c.id} onClick={()=>{set("customerId",c.id);setStep(2);}} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:form.customerId===c.id?"#FDF6DC":"transparent",borderBottom:i<arr.length-1?"1px solid #F2F2F7":"none",cursor:"pointer",border:"none",textAlign:"left"}}>
            <div style={{width:40,height:40,borderRadius:20,background:form.customerId===c.id?"#B8860B":"#E5E5EA",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:form.customerId===c.id?"white":"#8E8E93",flexShrink:0}}>{c.nome?.[0]}{c.cognome?.[0]}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:600,color:C.label}}>{c.nome} {c.cognome}</div>
              <div style={{fontSize:13,color:C.secondary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{displayPhone(c)||c.email||"—"}</div>
            </div>
            {form.customerId===c.id&&<span style={{color:"#B8860B",fontSize:20}}>✓</span>}
          </button>
        ))}</IOSCard>}
        <div style={{height:20}}/><div style={{display:"flex",gap:10}}><Btn label="← Indietro" variant="secondary" full onClick={()=>setStep(0)}/><Btn label="Avanti →" disabled={!form.customerId} full onClick={()=>setStep(2)}/></div>
      </div>}

      {/* STEP 2 */}
      {step===2&&<div>
        <div style={{fontSize:24,fontWeight:800,color:C.label,marginBottom:6}}>Che tipo di oggetto?</div>
        <div style={{fontSize:15,color:C.secondary,marginBottom:16}}>Seleziona la categoria — ☆ per aggiungere ai preferiti</div>
        {favCats.length>0&&(
          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:C.secondary,marginBottom:8,textTransform:"uppercase",letterSpacing:".5px"}}>⭐ Preferiti</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {favCats.map(id=>{const cat=CATS.find(c=>c.id===id);if(!cat)return null;return(
                <button key={id} onClick={()=>{set("categoria",cat.id);setStep(3);}} style={{background:form.categoria===cat.id?"linear-gradient(135deg,#C9A227,#B8860B)":"#FDF6DC",border:"none",borderRadius:14,padding:"10px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:22}}>{cat.icon}</span>
                  <span style={{fontSize:15,fontWeight:700,color:form.categoria===cat.id?"white":"#B8860B"}}>{cat.id}</span>
                </button>
              );})}
            </div>
          </div>
        )}
        {form.items?.length>0&&(
          <div style={{background:"#F0FFF4",borderRadius:14,padding:12,marginBottom:14,border:"1px solid #BBF7D0"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#059669",marginBottom:8}}>✅ Oggetti già aggiunti ({form.items.length})</div>
            {form.items.map((item,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:i<form.items.length-1?"1px solid #BBF7D0":"none"}}>
                <span>{CATS.find(c=>c.id===item.categoria)?.icon||"💍"}</span>
                <div style={{flex:1,fontSize:13,color:C.label}}>{item.categoria} · {item.descrizione?.slice(0,40)||"—"}{item.mano?" — Mano "+item.mano+" · "+item.dito:""}</div>
                <button onClick={()=>set("items",form.items.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.red,fontSize:16,cursor:"pointer"}}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:16}}>
          {CATS.map(cat=>(
            <div key={cat.id} style={{position:"relative"}}>
              <button onClick={()=>{set("categoria",cat.id);setStep(3);}} style={{width:"100%",background:form.categoria===cat.id?"linear-gradient(135deg,#C9A227,#B8860B)":"white",border:"none",borderRadius:22,padding:"22px 16px",textAlign:"center",cursor:"pointer",boxShadow:form.categoria===cat.id?"0 6px 20px rgba(184,134,11,.35)":"0 1px 4px rgba(0,0,0,.08)",transition:"all .2s"}}>
                <div style={{fontSize:44,marginBottom:10}}>{cat.icon}</div>
                <div style={{fontSize:17,fontWeight:800,color:form.categoria===cat.id?"white":C.label,marginBottom:5}}>{cat.id}</div>
                <div style={{fontSize:12,color:form.categoria===cat.id?"rgba(255,255,255,.75)":C.secondary,lineHeight:1.4}}>{cat.desc}</div>
              </button>
              <button onClick={e=>{e.stopPropagation();toggleFavCat(cat.id);}} style={{position:"absolute",top:8,right:8,background:"none",border:"none",fontSize:20,cursor:"pointer"}}>{favCats.includes(cat.id)?"⭐":"☆"}</button>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:10}}><Btn label="← Indietro" variant="secondary" full onClick={()=>setStep(1)}/><Btn label="Avanti →" disabled={!form.categoria} full onClick={()=>setStep(3)}/></div>
      </div>}

      {/* STEP 3 */}
      {step===3&&<div>
        <div style={{fontSize:24,fontWeight:800,color:C.label,marginBottom:6}}>Che lavoro serve?</div>
        <div style={{fontSize:15,color:C.secondary,marginBottom:20}}>Seleziona il tipo di intervento</div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:28}}>
          {WORK_TYPES.map(w=>(
            <button key={w.id} onClick={()=>{set("tipoLavoro",w.id);if(w.id==="Ridimensione"&&form.categoria==="Gioiello"){setShowRingDetail(true);}else{setStep(4);}}} style={{background:form.tipoLavoro===w.id?"linear-gradient(135deg,#C9A227,#B8860B)":"white",border:"none",borderRadius:18,padding:"15px 18px",textAlign:"left",cursor:"pointer",display:"flex",alignItems:"center",gap:16,boxShadow:form.tipoLavoro===w.id?"0 4px 16px rgba(184,134,11,.35)":"0 1px 4px rgba(0,0,0,.08)",transition:"all .2s"}}>
              <span style={{fontSize:32,flexShrink:0}}>{w.icon}</span>
              <div>
                <div style={{fontSize:17,fontWeight:700,color:form.tipoLavoro===w.id?"white":C.label}}>{w.id}</div>
                <div style={{fontSize:13,color:form.tipoLavoro===w.id?"rgba(255,255,255,.75)":C.secondary,marginTop:2}}>{w.desc}</div>
              </div>
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:10}}><Btn label="← Indietro" variant="secondary" full onClick={()=>setStep(2)}/><Btn label="Avanti →" disabled={!form.tipoLavoro} full onClick={()=>setStep(4)}/></div>
      </div>}

      {/* STEP 4 */}
      {step===4&&<div>
        <div style={{fontSize:24,fontWeight:800,color:C.label,marginBottom:6}}>Descrivi l'oggetto</div>
        <div style={{fontSize:15,color:C.secondary,marginBottom:20}}>Aggiungi foto e descrizione</div>
        {form.mano&&<div style={{background:"#EFF6FF",borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#1D4ED8",fontWeight:600}}>💍 Mano {form.mano} · {form.dito}</div>}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:600,color:C.secondary,marginBottom:8}}>📷 Foto oggetto</div>
          <button onClick={()=>fotoRef.current.click()} style={{width:"100%",border:"2px dashed #C9A227",borderRadius:16,padding:imgPreview?0:"20px",background:"#FDF6DC",cursor:"pointer",overflow:"hidden",minHeight:80,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {imgPreview?<img src={imgPreview} alt="oggetto" style={{width:"100%",maxHeight:200,objectFit:"cover",borderRadius:14}}/>:<div style={{textAlign:"center"}}><div style={{fontSize:36}}>📷</div><div style={{fontSize:14,color:"#B8860B",fontWeight:600,marginTop:6}}>Scatta o carica foto</div></div>}
          </button>
          <input ref={fotoRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFoto}/>
        </div>
        {aiEnabled&&(
          <div style={{background:"#FDF6DC",borderRadius:16,padding:14,marginBottom:16,border:"1px solid #F5E88A"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#B8860B",marginBottom:10}}>🤖 Catalogazione AI</div>
            <button onClick={catalogAI} disabled={aiLoad} style={{width:"100%",background:"#B8860B",color:"white",border:"none",borderRadius:10,padding:10,fontSize:13,fontWeight:700,cursor:"pointer",opacity:aiLoad?.6:1}}>{aiLoad?"⏳ Analisi…":"✨ Analizza AI"}</button>
            {aiMsg&&<div style={{fontSize:12,color:"#B8860B",background:"white",borderRadius:8,padding:"8px 10px",border:"1px solid #F5E88A",marginTop:8}}>{aiMsg}</div>}
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <IOSTextarea label="Descrizione oggetto *" placeholder="Es. Anello in oro giallo con solitario brillante…" value={form.descrizione} onChange={e=>set("descrizione",e.target.value)}/>
          <IOSInput label="Materiali (opzionale)" placeholder="Es. Oro 18k, argento 925…" value={form.materiali||""} onChange={e=>set("materiali",e.target.value)}/>
        </div>
        <div style={{height:24}}/><div style={{display:"flex",gap:10}}><Btn label="← Indietro" variant="secondary" full onClick={()=>setStep(3)}/><Btn label="Avanti →" disabled={!form.descrizione.trim()} full onClick={()=>setStep(5)}/></div>
      </div>}

      {/* STEP 5 */}
      {step===5&&<div>
        <div style={{fontSize:24,fontWeight:800,color:C.label,marginBottom:6}}>Descrivi il problema</div>
        <div style={{fontSize:15,color:C.secondary,marginBottom:16}}>Cosa deve essere fatto?</div>
        <div style={{background:"#F0FFF4",borderRadius:14,padding:12,marginBottom:16,border:"1px solid #BBF7D0"}}>
          <div style={{fontSize:12,color:"#059669",fontWeight:600}}>{form.categoria} · {form.tipoLavoro}{form.mano?" · Mano "+form.mano+" "+form.dito:""} · {form.descrizione.slice(0,40)}{form.descrizione.length>40?"…":""}</div>
        </div>
        <IOSTextarea label="Problema o lavoro richiesto *" placeholder="Es. Catena rotta a 3 cm dalla chiusura…" value={form.problema||""} onChange={e=>set("problema",e.target.value)}/>
        <div style={{height:24}}/><div style={{display:"flex",gap:10}}><Btn label="← Indietro" variant="secondary" full onClick={()=>setStep(4)}/><Btn label="Avanti →" disabled={!form.problema?.trim()} full onClick={()=>setStep(6)}/></div>
      </div>}

      {/* STEP 6 */}
      {step===6&&<div>
        <div style={{fontSize:24,fontWeight:800,color:C.label,marginBottom:6}}>Preventivo e date</div>
        <div style={{fontSize:15,color:C.secondary,marginBottom:20}}>Tutto opzionale — puoi modificare in seguito</div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <IOSInput label="Preventivo (€)" type="number" placeholder="0.00" value={form.preventivo||""} onChange={e=>set("preventivo",e.target.value)}/>
            <IOSInput label="Data consegna" type="date" value={form.dataConsegna||""} onChange={e=>set("dataConsegna",e.target.value)}/>
          </div>
          <Toggle label="✅ Preventivo accettato dal cliente" value={form.preventivoAccettato} onChange={v=>set("preventivoAccettato",v)}/>
          <Toggle label="⏳ Richiesta preventivo al fornitore" value={form.richiestaPreventivo} onChange={v=>{set("richiestaPreventivo",v);if(v)set("riparazioneInterna",false);}} sub="Segnala che serve preventivo dal riparatore esterno"/>
          <Toggle label="🏠 Riparazione interna" value={form.riparazioneInterna} onChange={v=>{set("riparazioneInterna",v);if(v)set("richiestaPreventivo",false);}} sub="La riparazione viene gestita internamente, senza invio al riparatore"/>
          <IOSTextarea label="Note interne" placeholder="Annotazioni per uso interno…" value={form.note||""} onChange={e=>set("note",e.target.value)}/>
        </div>
        <div style={{height:24}}/><div style={{display:"flex",gap:10}}><Btn label="← Indietro" variant="secondary" full onClick={()=>setStep(5)}/><Btn label="Rivedi riepilogo →" full onClick={()=>setStep(7)}/></div>
      </div>}

      {/* STEP 7 */}
      {step===7&&<div>
        <div style={{fontSize:24,fontWeight:800,color:C.label,marginBottom:6}}>Tutto pronto!</div>
        <div style={{fontSize:15,color:C.secondary,marginBottom:20}}>Controlla il riepilogo</div>
        {form.fotoUrl&&<img src={form.fotoUrl} alt="oggetto" style={{width:"100%",maxHeight:180,objectFit:"cover",borderRadius:16,marginBottom:12}}/>}
        <IOSCard style={{marginBottom:12}}><IOSRow icon="👤" label="Cliente" value={selC?selC.nome+" "+selC.cognome:"—"} last/></IOSCard>
        <IOSCard style={{marginBottom:12}}>
          <IOSRow icon={CATS.find(c=>c.id===form.categoria)?.icon||"💎"} label="Categoria" value={form.categoria}/>
          <IOSRow icon="🔧" label="Tipo lavoro" value={form.tipoLavoro}/>
          {form.mano&&<IOSRow icon="💍" label="Anello" value={`Mano ${form.mano} · ${form.dito}`}/>}
          <IOSRow icon="📝" label="Oggetto" sub={form.descrizione}/>
          {form.materiali&&<IOSRow icon="🪙" label="Materiali" value={form.materiali}/>}
          <IOSRow icon="🔍" label="Problema" sub={form.problema} last/>
        </IOSCard>
        {form.items?.length>0&&(
          <IOSCard style={{marginBottom:12}}>
            <div style={{padding:"10px 16px 6px",fontSize:12,fontWeight:700,color:C.secondary}}>OGGETTI AGGIUNTIVI ({form.items.length})</div>
            {form.items.map((item,i)=>(<IOSRow key={i} icon={CATS.find(c=>c.id===item.categoria)?.icon||"💍"} label={item.categoria+(item.tipoLavoro?" · "+item.tipoLavoro:"")} sub={item.descrizione+(item.mano?" — Mano "+item.mano+" · "+item.dito:"")} last={i===form.items.length-1}/>))}
          </IOSCard>
        )}
        <IOSCard style={{marginBottom:28}}>
          <IOSRow icon="💰" label="Preventivo" value={form.preventivo?form.preventivo+" €":"Da definire"}/>
          <IOSRow icon="✅" label="Prev. accettato" value={form.preventivoAccettato?"Sì":"No"}/>
          <IOSRow icon="🏠" label="Riparazione interna" value={form.riparazioneInterna?"Sì":"No"}/>
          <IOSRow icon="⏳" label="Rich. prev. fornitore" value={form.richiestaPreventivo?"Sì":"No"}/>
          <IOSRow icon="📅" label="Consegna prevista" value={fmtDate(form.dataConsegna)||"—"} last/>
        </IOSCard>
        <Btn label="✓ Crea riparazione e stampa etichette" full onClick={()=>onSave(form)}/>
        <div style={{height:10}}/>
        <button onClick={addCurrentItem} style={{width:"100%",background:"#F0FFF4",border:"2px dashed #34C759",borderRadius:14,padding:14,color:"#059669",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"-apple-system,sans-serif",marginBottom:10}}>➕ Aggiungi altro oggetto</button>
        <Btn label="← Modifica" variant="secondary" full onClick={()=>setStep(6)}/>
      </div>}
    </FullScreen>
  );
}

/* ── Pages ── */
/* ── Consegna Rapida al Cliente ── */
function ConsegnaModal({repairs,customers,onConsegna,onClose}) {
  const [tab,setTab]=useState("lista");
  const [q,setQ]=useState("");
  const [selIds,setSelIds]=useState([]);   // ids selezionati
  const [lockedCid,setLockedCid]=useState(null); // cliente bloccato
  const [done,setDone]=useState(false);
  const [qrMsg,setQrMsg]=useState("");     // feedback QR inline

  const pronte=repairs.filter(r=>r.status==="pronto");
  const filtered=pronte.filter(r=>{
    if(!q)return true;
    const l=q.toLowerCase();
    const c=customers.find(x=>x.id===r.customerId);
    return (r.numero||"").toLowerCase().includes(l)||(r.descrizione||"").toLowerCase().includes(l)||(c&&matchCustomer(c,l));
  });

  /* toggle selezione: se nessuno selezionato, blocca il cliente; se si deseleziona l'ultimo, sblocca */
  const toggle=(rep)=>{
    const alreadySel=selIds.includes(rep.id);
    if(!alreadySel&&lockedCid&&rep.customerId!==lockedCid)return; // cliente diverso, ignora
    setSelIds(prev=>{
      const next=alreadySel?prev.filter(x=>x!==rep.id):[...prev,rep.id];
      setLockedCid(next.length===0?null:rep.customerId);
      return next;
    });
  };

  const selRepairs=pronte.filter(r=>selIds.includes(r.id));
  const selCustomer=lockedCid?customers.find(x=>x.id===lockedCid):null;

  /* ── QR Camera ── */
  const videoRef=useRef();const canvasRef=useRef();const rafRef=useRef();const streamRef=useRef();
  const lastScanned=useRef(null);
  const [camErr,setCamErr]=useState(null);
  const hasBD="BarcodeDetector" in window;

  const handleDetected=useCallback((data)=>{
    const num=(data||"").trim().toUpperCase().match(/R\d{4}-\d{4}/)?.[0];
    if(!num||num===lastScanned.current)return false;
    const rep=repairs.find(r=>r.numero===num&&r.status==="pronto");
    if(!rep){setQrMsg("⚠️ "+num+": non trovata o non pronta");setTimeout(()=>setQrMsg(""),2000);return false;}
    if(lockedCid&&rep.customerId!==lockedCid){
      const c=customers.find(x=>x.id===rep.customerId);
      setQrMsg("⛔ "+num+": cliente diverso ("+(c?.cognome||"?")+")");
      setTimeout(()=>setQrMsg(""),2500);return false;
    }
    lastScanned.current=num;
    setTimeout(()=>{lastScanned.current=null;},2000);
    setSelIds(prev=>{
      if(prev.includes(rep.id))return prev;
      const next=[...prev,rep.id];
      setLockedCid(rep.customerId);
      return next;
    });
    setQrMsg("✅ "+num+" aggiunto");setTimeout(()=>setQrMsg(""),1500);
    return true;
  },[repairs,customers,lockedCid]);

  const stopCam=useCallback(()=>{cancelAnimationFrame(rafRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());},[]);

  useEffect(()=>{
    if(tab!=="qr")return;
    if(!navigator.mediaDevices?.getUserMedia){setCamErr("Fotocamera non disponibile");return;}
    let active=true;
    navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:1280},height:{ideal:720}}})
      .then(stream=>{
        if(!active){stream.getTracks().forEach(t=>t.stop());return;}
        streamRef.current=stream;
        if(videoRef.current){videoRef.current.srcObject=stream;videoRef.current.play();}
        const scan=()=>{
          if(!active)return;
          const video=videoRef.current;const canvas=canvasRef.current;
          if(video&&canvas&&video.readyState>=2){
            canvas.width=video.videoWidth;canvas.height=video.videoHeight;
            const ctx=canvas.getContext("2d");ctx.drawImage(video,0,0);
            if(hasBD){
              new window.BarcodeDetector({formats:["qr_code"]}).detect(canvas)
                .then(codes=>{for(const c of codes)handleDetected(c.rawValue);}).catch(()=>{});
            }else{
              const id=ctx.getImageData(0,0,canvas.width,canvas.height);
              const code=jsQR(id.data,id.width,id.height,{inversionAttempts:"dontInvert"});
              if(code)handleDetected(code.data);
            }
          }
          rafRef.current=requestAnimationFrame(scan);
        };
        rafRef.current=requestAnimationFrame(scan);
      })
      .catch(err=>{setCamErr("Fotocamera non disponibile: "+err.message);});
    return()=>{active=false;stopCam();};
  },[tab,handleDetected,stopCam,hasBD]);

  useEffect(()=>{if(tab!=="qr")stopCam();},[tab,stopCam]);

  const handleClose=()=>{stopCam();onClose();};

  const doConsegna=()=>{
    setDone(true);
    setTimeout(()=>{
      stopCam();
      selRepairs.forEach(r=>onConsegna(r,selCustomer));
      onClose();
    },600);
  };

  const TABS=[{k:"lista",l:"📋 Lista"},{k:"numero",l:"🔢 Numero"},{k:"qr",l:"📷 QR"}];

  /* ── riga riparazione riutilizzabile ── */
  const RepRow=({r})=>{
    const c=customers.find(x=>x.id===r.customerId);
    const sel=selIds.includes(r.id);
    const disabled=!sel&&lockedCid&&r.customerId!==lockedCid;
    return(
      <button onClick={()=>toggle(r)} disabled={!!disabled}
        style={{width:"100%",background:sel?"#ECFDF5":C.white,border:sel?"2px solid #059669":"2px solid transparent",borderRadius:14,padding:"11px 14px",cursor:disabled?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",boxShadow:"0 1px 3px rgba(0,0,0,.07)",opacity:disabled?.35:1,boxSizing:"border-box"}}>
        <div style={{width:22,height:22,borderRadius:11,border:"2px solid "+(sel?"#059669":"#D1D5DB"),background:sel?"#059669":"white",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          {sel&&<span style={{color:"white",fontSize:13,fontWeight:800}}>✓</span>}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:700,color:C.label}}>{r.numero}</div>
          <div style={{fontSize:12,color:C.secondary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.descrizione}{c&&!sel?" · "+c.cognome:""}</div>
        </div>
        {disabled&&<span style={{fontSize:11,color:C.secondary,flexShrink:0}}>altro cliente</span>}
      </button>
    );
  };

  const confirmFooter=selIds.length>0&&!done?(
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:700,color:"#059669"}}>{selIds.length} riparazione{selIds.length>1?"i":""} selezionata{selIds.length>1?"e":""}</div>
        {selCustomer&&<div style={{fontSize:12,color:"#047857"}}>👤 {selCustomer.nome} {selCustomer.cognome}</div>}
      </div>
      <button onClick={doConsegna} style={{background:"#059669",border:"none",borderRadius:12,padding:"10px 16px",color:"white",fontSize:14,fontWeight:700,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>🤝 Consegna {selIds.length>1?"tutte":""}</button>
    </div>
  ):null;

  return (
    <Sheet onClose={handleClose} title="🤝 Consegna al cliente" footer={confirmFooter}>

      {/* Tab selector */}
      <div style={{display:"flex",gap:6,marginBottom:14,background:"#F2F2F7",borderRadius:12,padding:4}}>
        {TABS.map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} style={{flex:1,padding:"8px 4px",borderRadius:9,border:"none",background:tab===t.k?"white":"transparent",color:tab===t.k?C.label:C.secondary,fontSize:13,fontWeight:tab===t.k?700:500,cursor:"pointer",boxShadow:tab===t.k?"0 1px 4px rgba(0,0,0,.1)":""}}>{t.l}</button>
        ))}
      </div>

      {/* ── TAB: Lista (raggruppata per cliente) ── */}
      {tab==="lista"&&!done&&(()=>{
        if(pronte.length===0)return <div style={{textAlign:"center",padding:"40px 20px",color:C.secondary}}><div style={{fontSize:48,marginBottom:8}}>✅</div><div style={{fontWeight:600}}>Nessuna riparazione pronta</div></div>;
        const groups=Object.values(pronte.reduce((acc,r)=>{if(!acc[r.customerId])acc[r.customerId]=[];acc[r.customerId].push(r);return acc;},{}));
        return(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {groups.map(group=>{
              const c=customers.find(x=>x.id===group[0].customerId);
              const isLocked=lockedCid&&group[0].customerId!==lockedCid;
              return(
                <div key={group[0].customerId} style={{opacity:isLocked?.35:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.secondary,marginBottom:6,paddingLeft:2}}>👤 {c?c.nome+" "+c.cognome:"Cliente sconosciuto"}{group.length>1?` · ${group.length} riparazioni`:""}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>{group.map(r=><RepRow key={r.id} r={r}/>)}</div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── TAB: Numero ── */}
      {tab==="numero"&&!done&&(
        <>
          <input autoFocus placeholder="Cerca per numero o cliente…" value={q} onChange={e=>setQ(e.target.value)}
            style={{width:"100%",background:C.white,border:"none",borderRadius:12,padding:"12px 14px",fontSize:15,fontFamily:"-apple-system,sans-serif",boxShadow:"0 1px 3px rgba(0,0,0,.07)",outline:"none",marginBottom:12,boxSizing:"border-box"}}/>
          {q&&filtered.length===0&&<div style={{textAlign:"center",padding:20,color:C.secondary}}>Nessuna riparazione pronta trovata</div>}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>{filtered.map(r=><RepRow key={r.id} r={r}/>)}</div>
        </>
      )}

      {/* ── TAB: QR ── */}
      {tab==="qr"&&!done&&(
        <>
          <div style={{borderRadius:16,overflow:"hidden",background:"#000",aspectRatio:"4/3",position:"relative",marginBottom:10}}>
            {camErr
              ?<div style={{color:"white",fontSize:13,padding:20,textAlign:"center",paddingTop:60}}>{camErr}</div>
              :<>
                <video ref={videoRef} playsInline muted style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                <canvas ref={canvasRef} style={{display:"none"}}/>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
                  <div style={{width:160,height:160,position:"relative"}}>
                    {[{top:0,left:0,borderTop:"4px solid white",borderLeft:"4px solid white",borderRadius:"10px 0 0 0"},{top:0,right:0,borderTop:"4px solid white",borderRight:"4px solid white",borderRadius:"0 10px 0 0"},{bottom:0,left:0,borderBottom:"4px solid white",borderLeft:"4px solid white",borderRadius:"0 0 0 10px"},{bottom:0,right:0,borderBottom:"4px solid white",borderRight:"4px solid white",borderRadius:"0 0 10px 0"}].map((s,i)=><div key={i} style={{position:"absolute",width:32,height:32,...s}}/>)}
                  </div>
                </div>
                <div style={{position:"absolute",bottom:10,left:0,right:0,textAlign:"center"}}>
                  {qrMsg
                    ?<span style={{background:qrMsg.startsWith("✅")?"rgba(5,150,105,.85)":qrMsg.startsWith("⛔")?"rgba(220,38,38,.85)":"rgba(0,0,0,.7)",color:"white",borderRadius:20,padding:"6px 16px",fontSize:13,fontWeight:600}}>{qrMsg}</span>
                    :<span style={{background:"rgba(0,0,0,.6)",color:"white",borderRadius:20,padding:"6px 16px",fontSize:13}}>Scansiona QR — la camera rimane attiva</span>
                  }
                </div>
              </>
            }
          </div>
          {selIds.length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <div style={{fontSize:12,fontWeight:700,color:C.secondary,marginBottom:2}}>Scansionate:</div>
              {selRepairs.map(r=>(
                <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,background:"#ECFDF5",borderRadius:10,padding:"8px 12px"}}>
                  <span style={{fontSize:13,fontWeight:700,color:"#059669",flex:1}}>{r.numero} · {r.descrizione}</span>
                  <button onClick={()=>toggle(r)} style={{background:"none",border:"none",color:C.red,fontSize:16,cursor:"pointer",padding:"0 4px"}}>✕</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {done&&(
        <div style={{textAlign:"center",padding:"30px 20px"}}>
          <div style={{fontSize:60,marginBottom:12}}>✅</div>
          <div style={{fontSize:20,fontWeight:800,color:C.label}}>{selIds.length>1?`${selIds.length} riparazioni consegnate`:"Consegnato!"}</div>
        </div>
      )}
    </Sheet>
  );
}

function Dashboard({repairs,customers,ddts,onView,onReceipt,onNew,onScan,onNav,onConsegna}) {
  const getDDT=r=>ddts.find(d=>d.riparazioniIds?.includes(r.id));
  const active=repairs.filter(r=>r.status!=="consegnato");
  const ready=repairs.filter(r=>r.status==="pronto");
  const presso=repairs.filter(r=>r.status==="presso_esterno");
  const overdue=repairs.filter(r=>r.status!=="consegnato"&&r.status!=="pronto"&&r.dataConsegna&&r.dataConsegna<today());
  const recent=[...repairs].sort((a,b)=>(b.dataRicevuta||"").localeCompare(a.dataRicevuta||"")).slice(0,5);
  const statCards=[
    {l:"Attive",v:active.length,i:"🔧",bg:"#EFF6FF",col:"#1D4ED8",filter:"__active__"},
    {l:"Pronte al ritiro",v:ready.length,i:"✅",bg:"#ECFDF5",col:"#059669",filter:"pronto"},
    {l:"Presso riparatori",v:presso.length,i:"📦",bg:"#F5F3FF",col:"#7C3AED",filter:"presso_esterno"},
    {l:"In ritardo",v:overdue.length,i:"⚠️",bg:"#FFF1F2",col:"#E11D48",filter:"__overdue__"},
  ];
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        {statCards.map(s=>(
          <button key={s.l} onClick={()=>onNav(s.filter)} style={{background:s.bg,borderRadius:20,padding:"18px 16px",border:"none",cursor:"pointer",textAlign:"left",width:"100%"}}>
            <div style={{fontSize:28,marginBottom:6}}>{s.i}</div>
            <div style={{fontSize:30,fontWeight:800,color:s.col,letterSpacing:"-1px"}}>{s.v}</div>
            <div style={{fontSize:12,color:s.col,opacity:.7,fontWeight:600,marginTop:2}}>{s.l}</div>
          </button>
        ))}
      </div>
      {presso.length>0&&(
        <button onClick={()=>onNav("__rientro__")} style={{width:"100%",background:"linear-gradient(135deg,#059669,#047857)",borderRadius:18,padding:"16px 20px",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:14,marginBottom:14,boxShadow:"0 4px 16px rgba(5,150,105,.3)"}}>
          <span style={{fontSize:34}}>📥</span>
          <div style={{textAlign:"left",flex:1}}>
            <div style={{fontSize:16,fontWeight:700,color:"white"}}>Rientro rapido dal fornitore</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.8)",marginTop:2}}>{presso.length} riparazion{presso.length===1?"e":"i"} da gestire</div>
          </div>
          <span style={{background:"rgba(255,255,255,.25)",borderRadius:20,padding:"4px 12px",fontSize:16,fontWeight:800,color:"white"}}>{presso.length}</span>
        </button>
      )}
      {ready.length>0&&(
        <button onClick={onConsegna} style={{width:"100%",background:"linear-gradient(135deg,#2563EB,#1D4ED8)",borderRadius:18,padding:"16px 20px",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:14,marginBottom:14,boxShadow:"0 4px 16px rgba(37,99,235,.3)"}}>
          <span style={{fontSize:34}}>🤝</span>
          <div style={{textAlign:"left",flex:1}}>
            <div style={{fontSize:16,fontWeight:700,color:"white"}}>Consegna al cliente</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.8)",marginTop:2}}>Seleziona, cerca o scansiona il QR</div>
          </div>
          <span style={{background:"rgba(255,255,255,.25)",borderRadius:20,padding:"4px 12px",fontSize:16,fontWeight:800,color:"white"}}>{ready.length}</span>
        </button>
      )}
      <button onClick={onScan} style={{width:"100%",background:"linear-gradient(135deg,#7C3AED,#6D28D9)",borderRadius:18,padding:"16px 20px",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:14,marginBottom:20,boxShadow:"0 4px 16px rgba(124,58,237,.3)"}}>
        <span style={{fontSize:34}}>📷</span>
        <div style={{textAlign:"left"}}><div style={{fontSize:16,fontWeight:700,color:"white"}}>Scansiona QR live</div><div style={{fontSize:13,color:"rgba(255,255,255,.75)",marginTop:2}}>Punta la fotocamera sul QR dell'etichetta</div></div>
      </button>
      {ready.length>0&&<><SectionTitle>✅ Pronte al ritiro</SectionTitle>{ready.map(r=><RepairCard key={r.id} repair={r} customer={customers.find(c=>c.id===r.customerId)} ddt={getDDT(r)} onPress={()=>onView(r)} onReceipt={onReceipt}/>)}</>}
      <SectionTitle>🕐 Ultime riparazioni</SectionTitle>
      {recent.length===0
        ?<div style={{textAlign:"center",padding:"40px 20px",color:C.secondary}}><div style={{fontSize:52,marginBottom:12}}>💍</div><div style={{fontSize:16,fontWeight:600,marginBottom:16}}>Nessuna riparazione ancora</div><Btn label="+ Prima riparazione" onClick={onNew}/></div>
        :recent.map(r=><RepairCard key={r.id} repair={r} customer={customers.find(c=>c.id===r.customerId)} ddt={getDDT(r)} onPress={()=>onView(r)} onReceipt={onReceipt}/>)}
    </div>
  );
}

function RepairsPage({repairs,customers,ddts,onView,onReceipt,onNew,onScan,navFilter,onClearNavFilter,onRientro}) {
  const [q,setQ]=useState("");
  const [fs,setFs]=useState(navFilter||"");
  const getDDT=r=>ddts.find(d=>d.riparazioniIds?.includes(r.id));
  const pressoCnt=repairs.filter(r=>r.status==="presso_esterno").length;

  /* Sincronizza filtro quando arriva da Dashboard */
  useEffect(()=>{ setFs(navFilter||""); },[navFilter]);

  const filtered=repairs.filter(r=>{
    const c=customers.find(x=>x.id===r.customerId);
    const l=q.toLowerCase();
    const matchQ=!l||(r.numero||"").toLowerCase().includes(l)||(r.descrizione||"").toLowerCase().includes(l)||(c&&(c.nome+" "+c.cognome).toLowerCase().includes(l));
    let matchF=true;
    if(fs==="__active__") matchF=r.status!=="consegnato";
    else if(fs==="__overdue__") matchF=r.status!=="consegnato"&&r.status!=="pronto"&&r.dataConsegna&&r.dataConsegna<today();
    else if(fs) matchF=r.status===fs;
    return matchQ&&matchF;
  }).sort((a,b)=>(b.dataRicevuta||"").localeCompare(a.dataRicevuta||""));

  const handleFsChange=(v)=>{ setFs(v); if(onClearNavFilter) onClearNavFilter(); };

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <input style={{flex:1,background:C.white,border:"none",borderRadius:12,padding:"10px 14px",fontSize:15,fontFamily:"-apple-system,sans-serif",boxShadow:"0 1px 3px rgba(0,0,0,.07)",outline:"none"}} placeholder="🔍  Cerca…" value={q} onChange={e=>setQ(e.target.value)}/>
        <select style={{background:C.white,border:"none",borderRadius:12,padding:"10px",fontSize:13,fontFamily:"-apple-system,sans-serif",boxShadow:"0 1px 3px rgba(0,0,0,.07)"}} value={fs} onChange={e=>handleFsChange(e.target.value)}>
          <option value="">Tutti</option>
          <option value="__active__">🔧 Attive</option>
          <option value="__overdue__">⚠️ In ritardo</option>
          {Object.entries(STATUSES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      {pressoCnt>0&&(
        <button onClick={onRientro} style={{width:"100%",background:"linear-gradient(135deg,#059669,#047857)",borderRadius:14,padding:"12px 16px",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:12,marginBottom:14,boxShadow:"0 3px 12px rgba(5,150,105,.3)"}}>
          <span style={{fontSize:22}}>📥</span>
          <div style={{textAlign:"left",flex:1}}>
            <div style={{fontSize:14,fontWeight:700,color:"white"}}>Rientro rapido dal fornitore</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.8)"}}>{pressoCnt} riparazioni presso riparatori esterni</div>
          </div>
          <span style={{background:"rgba(255,255,255,.25)",borderRadius:20,padding:"3px 10px",fontSize:13,fontWeight:700,color:"white"}}>{pressoCnt}</span>
        </button>
      )}
      <button onClick={onScan} style={{width:"100%",background:"#F5F3FF",borderRadius:14,padding:"12px 16px",border:"1px solid #DDD6FE",cursor:"pointer",display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
        <span style={{fontSize:22}}>📷</span>
        <div style={{textAlign:"left"}}><div style={{fontSize:14,fontWeight:700,color:C.purple}}>Scansiona QR live</div><div style={{fontSize:12,color:"#9F7AEA"}}>Aggiornamento stato in tempo reale</div></div>
      </button>
      {filtered.length===0?<div style={{textAlign:"center",padding:"40px 20px",color:C.secondary}}><div style={{fontSize:40,marginBottom:8}}>🔍</div>Nessuna riparazione trovata</div>:filtered.map(r=><RepairCard key={r.id} repair={r} customer={customers.find(c=>c.id===r.customerId)} ddt={getDDT(r)} onPress={()=>onView(r)} onReceipt={onReceipt}/>)}
      <div style={{height:80}}/>
      <button onClick={onNew} style={{position:"fixed",bottom:86,right:20,width:56,height:56,borderRadius:28,background:"linear-gradient(135deg,#C9A227,#B8860B)",border:"none",fontSize:28,color:"white",cursor:"pointer",boxShadow:"0 4px 20px rgba(184,134,11,.5)",zIndex:40,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
    </div>
  );
}

function CustomersPage({customers,repairs,onView,onNew,onImport,onDuplicates}) {
  const [q,setQ]=useState("");
  const [sort,setSort]=useState("cognome_az");
  const [filter,setFilter]=useState("tutti");

  /* Calcola riparazioni per ogni cliente */
  const repCountAll=(cid)=>repairs.filter(r=>r.customerId===cid).length;
  const repActiveCount=(cid)=>repairs.filter(r=>r.customerId===cid&&r.status!=="consegnato").length;

  /* Filtro */
  const afterFilter=customers.filter(c=>{
    if(!matchCustomer(c,q))return false;
    if(filter==="con_attive")   return repActiveCount(c.id)>0;
    if(filter==="solo_chiuse")  return repCountAll(c.id)>0&&repActiveCount(c.id)===0;
    if(filter==="senza")        return repCountAll(c.id)===0;
    return true;
  });

  /* Ordine */
  const sorted=[...afterFilter].sort((a,b)=>{
    if(sort==="cognome_az") return (a.cognome||"").localeCompare(b.cognome||"","it");
    if(sort==="cognome_za") return (b.cognome||"").localeCompare(a.cognome||"","it");
    if(sort==="nome_az")    return (a.nome||"").localeCompare(b.nome||"","it");
    if(sort==="piu_rip")    return repCountAll(b.id)-repCountAll(a.id);
    if(sort==="meno_rip")   return repCountAll(a.id)-repCountAll(b.id);
    return 0;
  });

  const FILTERS=[
    {k:"tutti",      l:"Tutti"},
    {k:"con_attive", l:"🔧 Attivi"},
    {k:"solo_chiuse",l:"✅ Chiusi"},
    {k:"senza",      l:"Nessuna rip."},
  ];

  /* Contatori per i badge */
  const counts={
    tutti:      customers.length,
    con_attive: customers.filter(c=>repActiveCount(c.id)>0).length,
    solo_chiuse:customers.filter(c=>repCountAll(c.id)>0&&repActiveCount(c.id)===0).length,
    senza:      customers.filter(c=>repCountAll(c.id)===0).length,
  };

  return (
    <div>
      {/* Ricerca */}
      <input style={{width:"100%",background:C.white,border:"none",borderRadius:12,padding:"10px 14px",fontSize:15,fontFamily:"-apple-system,sans-serif",boxShadow:"0 1px 3px rgba(0,0,0,.07)",outline:"none",marginBottom:10,boxSizing:"border-box"}} placeholder="🔍  Cerca cliente…" value={q} onChange={e=>setQ(e.target.value)}/>

      {/* Filtri rapidi */}
      <div style={{display:"flex",gap:6,marginBottom:10,overflowX:"auto",paddingBottom:2}}>
        {FILTERS.map(f=>(
          <button key={f.k} onClick={()=>setFilter(f.k)} style={{flexShrink:0,padding:"6px 12px",borderRadius:20,border:"none",background:filter===f.k?"#1c1c1e":"#F2F2F7",color:filter===f.k?"white":C.secondary,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
            {f.l}
            <span style={{background:filter===f.k?"rgba(255,255,255,.25)":"#E5E5EA",color:filter===f.k?"white":C.secondary,borderRadius:10,padding:"1px 6px",fontSize:11,fontWeight:700}}>{counts[f.k]}</span>
          </button>
        ))}
      </div>

      {/* Ordinamento */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <span style={{fontSize:12,color:C.secondary,flexShrink:0}}>Ordina:</span>
        <select value={sort} onChange={e=>setSort(e.target.value)} style={{flex:1,background:C.white,border:"none",borderRadius:10,padding:"7px 10px",fontSize:13,fontFamily:"-apple-system,sans-serif",boxShadow:"0 1px 3px rgba(0,0,0,.07)",color:C.label}}>
          <option value="cognome_az">Cognome A→Z</option>
          <option value="cognome_za">Cognome Z→A</option>
          <option value="nome_az">Nome A→Z</option>
          <option value="piu_rip">Più riparazioni</option>
          <option value="meno_rip">Meno riparazioni</option>
        </select>
        <span style={{fontSize:12,color:C.secondary,flexShrink:0}}>{sorted.length} clienti</span>
      </div>

      {/* Bottoni azioni */}
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <button onClick={onImport} style={{flex:1,background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:14,padding:"11px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>📲</span>
          <div style={{textAlign:"left"}}><div style={{fontSize:14,fontWeight:700,color:"#1D4ED8"}}>Importa .vcf</div><div style={{fontSize:12,color:"#3B82F6"}}>Contatti iPhone</div></div>
        </button>
        <button onClick={onDuplicates} style={{flex:1,background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:14,padding:"11px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>🔍</span>
          <div style={{textAlign:"left"}}><div style={{fontSize:14,fontWeight:700,color:"#C2410C"}}>Duplicati</div><div style={{fontSize:12,color:"#EA580C"}}>Rimuovi in blocco</div></div>
        </button>
      </div>

      {/* Lista */}
      {sorted.length===0
        ?<div style={{textAlign:"center",padding:"40px 20px",color:C.secondary}}><div style={{fontSize:40,marginBottom:8}}>👥</div>Nessun cliente trovato</div>
        :<IOSCard>{sorted.map((c,i)=>{
          const tot=repCountAll(c.id);
          const att=repActiveCount(c.id);
          const avatar=<div style={{width:36,height:36,borderRadius:18,background:"#FDF6DC",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#B8860B"}}>{c.nome?.[0]}{c.cognome?.[0]}</div>;
          const badge=att>0
            ?<span style={{fontSize:11,background:"#ECFDF5",color:"#059669",padding:"2px 8px",borderRadius:10,fontWeight:700}}>{att} attive</span>
            :tot>0
              ?<span style={{fontSize:11,background:"#F2F2F7",color:C.secondary,padding:"2px 8px",borderRadius:10,fontWeight:600}}>{tot} rip.</span>
              :<span style={{fontSize:11,background:"#FFF1F2",color:C.red,padding:"2px 8px",borderRadius:10,fontWeight:600}}>nessuna</span>;
          return (
            <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",borderBottom:i===sorted.length-1?"none":"1px solid #F2F2F7"}}>
              <button onClick={()=>onView(c)} style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0,background:"none",border:"none",cursor:"pointer",padding:0,textAlign:"left"}}>
                {avatar}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:600,color:C.label,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.nome} {c.cognome}</div>
                  <div style={{fontSize:13,color:C.secondary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{displayPhone(c)||c.email||"—"}</div>
                </div>
                {badge}
                <svg width="14" height="14" fill="none" stroke={C.separator} strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24" style={{flexShrink:0}}><path d="M9 5l7 7-7 7"/></svg>
              </button>
              <WABtn customer={c} size={32}/>
            </div>
          );
        })}</IOSCard>
      }
      <div style={{height:80}}/>
      <button onClick={onNew} style={{position:"fixed",bottom:86,right:20,width:56,height:56,borderRadius:28,background:"linear-gradient(135deg,#C9A227,#B8860B)",border:"none",fontSize:28,color:"white",cursor:"pointer",boxShadow:"0 4px 20px rgba(184,134,11,.5)",zIndex:40,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
    </div>
  );
}

function DDTPage({ddts,repairs,customers,onView,onNew}) {
  const [q,setQ]=useState("");
  const filtered=[...ddts].filter(d=>!q||d.numero.toLowerCase().includes(q.toLowerCase())||(d.riparatore?.nome||"").toLowerCase().includes(q.toLowerCase())).sort((a,b)=>(b.data||"").localeCompare(a.data||""));

  /* Calcola totali su tutte le riparazioni DDT già rientrate (anche DDT parzialmente rientrati) */
  const ripRientrate=ddts.flatMap(d=>repairs.filter(r=>d.riparazioniIds?.includes(r.id)&&r.status!=="presso_esterno"));
  const totSpesa=ripRientrate.reduce((s,r)=>s+(parseFloat(r.spesa)||0),0);
  const totRicavi=ripRientrate.reduce((s,r)=>s+(parseFloat(r.prezzoFinale)||0),0);
  const totMargine=totRicavi-totSpesa;
  const nDDTRientrati=ddts.filter(d=>d.stato==="rientrato").length;

  return (
    <div>
      {/* Card totali su DDT rientrati */}
      {ripRientrate.length>0&&(
        <div style={{background:C.white,borderRadius:20,padding:"14px 16px",marginBottom:14,boxShadow:"0 1px 4px rgba(0,0,0,.07)"}}>
          <div style={{fontSize:12,fontWeight:700,color:C.secondary,marginBottom:10,textTransform:"uppercase",letterSpacing:".5px"}}>💰 Totali DDT — {ripRientrate.length} riparazioni rientrate{nDDTRientrati>0?` · ${nDDTRientrati} DDT chiusi`:""}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            {[
              {l:"Spesa fornitori", v:totSpesa, bg:"#FFF1F2", col:"#E11D48"},
              {l:"Ricavi clienti",  v:totRicavi, bg:"#ECFDF5", col:"#059669"},
              {l:"Margine totale",  v:totMargine, bg:totMargine>=0?"#EFF6FF":"#FFF1F2", col:totMargine>=0?"#1D4ED8":"#E11D48"},
            ].map(s=>(
              <div key={s.l} style={{background:s.bg,borderRadius:14,padding:"10px 8px",textAlign:"center"}}>
                <div style={{fontSize:13,fontWeight:800,color:s.col}}>{s.v.toFixed(2)} €</div>
                <div style={{fontSize:10,color:s.col,opacity:.75,fontWeight:600,marginTop:2,lineHeight:1.3}}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <input style={{width:"100%",background:C.white,border:"none",borderRadius:12,padding:"10px 14px",fontSize:15,fontFamily:"-apple-system,sans-serif",boxShadow:"0 1px 3px rgba(0,0,0,.07)",outline:"none",marginBottom:14,boxSizing:"border-box"}} placeholder="🔍  Cerca DDT o riparatore…" value={q} onChange={e=>setQ(e.target.value)}/>

      {filtered.length===0
        ?<div style={{textAlign:"center",padding:"40px 20px",color:C.secondary}}><div style={{fontSize:52,marginBottom:12}}>📦</div><div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Nessun DDT ancora</div><Btn label="+ Crea primo DDT" variant="purple" onClick={onNew}/></div>
        :<div>{filtered.map(d=>{
          const items=repairs.filter(r=>d.riparazioniIds?.includes(r.id));
          const spesa=items.reduce((s,r)=>s+(parseFloat(r.spesa)||0),0);
          const ricavi=items.reduce((s,r)=>s+(parseFloat(r.prezzoFinale)||0),0);
          const margine=ricavi-spesa;
          const hasCosts=spesa>0||ricavi>0;
          return(
            <button key={d.id} onClick={()=>onView(d)} style={{width:"100%",background:C.white,borderRadius:20,padding:"14px 16px",textAlign:"left",border:"none",cursor:"pointer",boxShadow:"0 1px 4px rgba(0,0,0,.07)",display:"flex",gap:12,alignItems:"center",marginBottom:10}}>
              <div style={{width:44,height:44,borderRadius:22,background:d.stato==="rientrato"?"#ECFDF5":"#F5F3FF",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{d.stato==="rientrato"?"✅":"📤"}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontSize:14,fontWeight:700,color:C.label}}>{d.numero}</span>
                  <span style={{fontSize:11,background:d.stato==="rientrato"?"#ECFDF5":"#F5F3FF",color:d.stato==="rientrato"?"#059669":C.purple,padding:"2px 8px",borderRadius:10,fontWeight:700}}>{d.stato==="rientrato"?"Rientrato":"Inviato"}</span>
                </div>
                <div style={{fontSize:14,color:C.label}}>📍 {d.riparatore?.nome||"—"}</div>
                <div style={{fontSize:12,color:C.secondary,marginTop:2}}>{fmtDate(d.data)} · {items.length} oggetti</div>
                {hasCosts&&(
                  <div style={{display:"flex",gap:10,marginTop:4,flexWrap:"wrap"}}>
                    {spesa>0&&<span style={{fontSize:11,color:"#E11D48",fontWeight:600}}>↓ {spesa.toFixed(2)} €</span>}
                    {ricavi>0&&<span style={{fontSize:11,color:"#059669",fontWeight:600}}>↑ {ricavi.toFixed(2)} €</span>}
                    {spesa>0&&ricavi>0&&<span style={{fontSize:11,color:margine>=0?"#1D4ED8":"#E11D48",fontWeight:700}}>= {margine.toFixed(2)} €</span>}
                  </div>
                )}
              </div>
              <svg width="14" height="14" fill="none" stroke={C.separator} strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
            </button>
          );
        })}</div>
      }
      <div style={{height:80}}/>
      <button onClick={onNew} style={{position:"fixed",bottom:86,right:20,width:56,height:56,borderRadius:28,background:C.purple,border:"none",fontSize:28,color:"white",cursor:"pointer",boxShadow:"0 4px 20px rgba(175,82,222,.4)",zIndex:40,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
    </div>
  );
}

function SettingsPage({customers,repairs,ddts,repairers,onRestore,onSaveRepairer,onDeleteRepairer}) {
  const [deleted,setDeleted]=useState([]); const [showDeleted,setShowDeleted]=useState(false);
  const [showRepairers,setShowRepairers]=useState(false);
  const [restoring,setRestoring]=useState(false); const [msg,setMsg]=useState("");
  const [printUrl,setPrintUrl]=useState(()=>localStorage.getItem('printServerUrl')||"");
  const [printStatus,setPrintStatus]=useState(null); const [testingPrint,setTestingPrint]=useState(false);
  const fileRef=useRef();

  const savePrintUrl=(url)=>{
    const clean=url.trim().replace(/\/$/,'');
    setPrintUrl(clean);
    localStorage.setItem('printServerUrl',clean);
  };

  const testPrintServer=async()=>{
    if(!printUrl){setPrintStatus("⚠️ Inserisci l'URL del server");return;}
    setTestingPrint(true);setPrintStatus(null);
    try{
      const r=await fetch(`${printUrl}/status`,{signal:AbortSignal.timeout(4000)});
      const d=await r.json();
      if(d.ok) setPrintStatus(`✅ Connesso · Stampante: ${d.printer||"rilevata"}`);
      else setPrintStatus(`⚠️ Server raggiunto ma: ${d.error||"errore sconosciuto"}`);
    }catch(e){
      setPrintStatus(`❌ Non raggiungibile: ${e.message}`);
    }
    setTestingPrint(false);
  };

  const loadDeleted=async()=>{setDeleted(await api.getDeletedRepairs());setShowDeleted(true);};
  const doRestore=async(id)=>{await api.restoreRepair(id);setDeleted(d=>d.filter(r=>r.id!==id));};
  const doExport=()=>{const bk={version:2,date:new Date().toISOString(),customers,repairs,ddts,repairers};const blob=new Blob([JSON.stringify(bk,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="gioielleria-backup-"+today()+".json";a.click();URL.revokeObjectURL(url);setMsg("✅ Backup esportato!");};
  const doImport=async(e)=>{const file=e.target.files?.[0];if(!file)return;setRestoring(true);setMsg("");try{const bk=JSON.parse(await file.text());if(!bk.customers||!bk.repairs)throw new Error("File non valido");await onRestore(bk);setMsg(`✅ Ripristino completato! ${bk.customers.length} clienti, ${bk.repairs.length} riparazioni.`);}catch(err){setMsg("❌ Errore: "+err.message);}setRestoring(false);};

  return (
    <div>
      {/* ── Stampa ── */}
      <SectionTitle>🖨️ Server di stampa</SectionTitle>
      <IOSCard style={{marginBottom:12}}>
        <div style={{padding:"12px 16px"}}>
          <div style={{fontSize:13,color:C.secondary,marginBottom:8,lineHeight:1.5}}>
            {isIOS
              ? "iPhone usa il server sul Mac Mini per stampare con il formato corretto."
              : "Su Mac le etichette vengono stampate direttamente dal browser."}
          </div>
          {isIOS&&<>
            <div style={{fontSize:13,fontWeight:600,color:C.secondary,marginBottom:6}}>URL server Mac Mini</div>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <input
                value={printUrl}
                onChange={e=>setPrintUrl(e.target.value)}
                onBlur={e=>savePrintUrl(e.target.value)}
                placeholder="http://192.168.1.X:3001"
                style={{flex:1,background:"#F2F2F7",border:"none",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"-apple-system,sans-serif",outline:"none"}}
              />
              <button onClick={()=>savePrintUrl(printUrl)} style={{background:C.blue,border:"none",borderRadius:10,padding:"10px 14px",color:"white",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>Salva</button>
            </div>
            <button onClick={testPrintServer} disabled={testingPrint} style={{width:"100%",background:"#F2F2F7",border:"none",borderRadius:10,padding:"10px",fontSize:13,fontWeight:600,color:C.label,cursor:"pointer",opacity:testingPrint?.6:1}}>
              {testingPrint?"⏳ Verifica…":"🔍 Testa connessione"}
            </button>
            {printStatus&&<div style={{marginTop:8,fontSize:13,color:printStatus.startsWith("✅")?"#059669":printStatus.startsWith("⚠️")?"#B8860B":C.red,fontWeight:600}}>{printStatus}</div>}
            <div style={{marginTop:12,background:"#F2F2F7",borderRadius:10,padding:10,fontSize:12,color:C.secondary,lineHeight:1.6}}>
              <b>Setup Mac Mini:</b><br/>
              1. Apri Terminale e vai nella cartella <code>print-server</code><br/>
              2. <code>npm install</code> poi <code>node server.js</code><br/>
              3. L'IP del Mac Mini: <b>Impostazioni → WiFi → ⓘ</b>
            </div>
          </>}
          {!isIOS&&<div style={{fontSize:13,color:C.secondary}}>Accedi dall'iPhone per configurare il server remoto.</div>}
        </div>
      </IOSCard>

      {/* ── Riparatori ── */}
      <SectionTitle>🔧 Riparatori</SectionTitle>
      <IOSCard style={{marginBottom:showRepairers?0:12}}>
        <IOSRow icon="🏭" label="Gestisci riparatori" sub={repairers.length+" riparatori salvati"} onPress={()=>setShowRepairers(v=>!v)} chevron last/>
      </IOSCard>
      {showRepairers&&<div style={{marginBottom:12}}><RepairerManager repairers={repairers} onSave={onSaveRepairer} onDelete={onDeleteRepairer}/></div>}

      {/* ── Backup ── */}
      <SectionTitle>💾 Backup e ripristino</SectionTitle>
      <IOSCard style={{marginBottom:12}}>
        <IOSRow icon="⬇️" label="Esporta backup" sub="Scarica tutti i dati in formato JSON" onPress={doExport} chevron/>
        <IOSRow icon="⬆️" label="Ripristina da backup" sub="Importa dati da un file JSON" onPress={()=>fileRef.current.click()} chevron last/>
      </IOSCard>
      <input ref={fileRef} type="file" accept=".json" style={{display:"none"}} onChange={doImport}/>
      {restoring&&<div style={{textAlign:"center",padding:20,color:C.secondary}}>⏳ Ripristino in corso…</div>}
      {msg&&<div style={{background:msg.startsWith("✅")?"#ECFDF5":"#FFF1F2",borderRadius:14,padding:14,fontSize:14,color:msg.startsWith("✅")?"#059669":C.red,border:"1px solid "+(msg.startsWith("✅")?"#BBF7D0":"#FECDD3"),marginBottom:12}}>{msg}</div>}

      {/* ── Archivio ── */}
      <SectionTitle>🗑️ Archivio eliminati</SectionTitle>
      <IOSCard style={{marginBottom:12}}><IOSRow icon="📂" label="Mostra riparazioni eliminate" sub="Visualizza e ripristina riparazioni rimosse" onPress={loadDeleted} chevron last/></IOSCard>
      {showDeleted&&(deleted.length===0?<div style={{textAlign:"center",padding:20,color:C.secondary,background:C.white,borderRadius:14,fontSize:14}}>Nessuna riparazione eliminata</div>:<div style={{display:"flex",flexDirection:"column",gap:8}}>{deleted.map(r=>(<div key={r.id} style={{background:C.white,borderRadius:14,padding:"12px 14px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}><div style={{flex:1,minWidth:0}}><div style={{fontSize:14,fontWeight:700,color:C.secondary}}>{r.numero}</div><div style={{fontSize:13,color:C.secondary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.descrizione}</div><div style={{fontSize:11,color:C.secondary}}>{fmtDate(r.dataRicevuta)}</div></div><button onClick={()=>doRestore(r.id)} style={{background:"#ECFDF5",border:"none",borderRadius:10,padding:"8px 12px",color:"#059669",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>↩️ Ripristina</button></div>))}</div>)}

      {/* ── Info ── */}
      <SectionTitle>ℹ️ Informazioni</SectionTitle>
      <IOSCard>
        <IOSRow icon="💍" label={SHOP.nome} sub={SHOP.indirizzo+", "+SHOP.citta}/>
        <IOSRow icon="📞" label={SHOP.tel} sub={SHOP.email}/>
        <IOSRow icon="🔢" label={"P.I. "+SHOP.piva+" · SDI: "+SHOP.sdi} sub={"v8 · "+customers.length+" clienti · "+repairs.length+" riparazioni"} last/>
      </IOSCard>
    </div>
  );
}

/* ── Receipt Modal ── */
function OrderReceiptModal({order,customer:c,onClose}) {
  const totAccMsg=order.prodotti.reduce((a,p)=>a+(parseFloat(p.acconto)||0),0);
  const prodLines=order.prodotti.map(p=>{let line=`• ${p.quantita>1?p.quantita+"× ":""}${p.descrizione}`;if(p.dataConsegnaPrevista)line+=` (cons. ${fmtDate(p.dataConsegnaPrevista)})`;if(p.acconto)line+=` — acc. ${p.acconto} €`;return line;}).join("\n");
  const msg=`Gentile ${c?.nome} ${c?.cognome},\nConferma ordine n° ${order.numero}\n${order.prodotti.length>0?prodLines+"\n":""}\n${totAccMsg>0?"Acconto totale versato: "+totAccMsg.toFixed(2)+" €\n":""}\nGrazie per la fiducia!\n${SHOP.nome}\n${SHOP.indirizzo}, ${SHOP.citta}\nTel. ${SHOP.tel}`;
  const doPrint=()=>{try{smartPrint(orderLabelHTML(order,c));}catch(e){console.error(e);}};
  const doWA=()=>{const p=c?fullPhone(c):"";if(p)window.open("https://wa.me/"+p+"?text="+encodeURIComponent(msg),"_blank");};
  const doEmail=()=>{if(c?.email)window.open("mailto:"+c.email+"?subject="+encodeURIComponent("Ordine "+order.numero)+"&body="+encodeURIComponent(msg));};
  const doSMS=()=>{const p=c?fullPhone(c):"";if(p)window.open("sms:+"+p+"?body="+encodeURIComponent(msg));};
  return (
    <Sheet onClose={onClose} title={"Etichette "+order.numero}>
      <IOSCard style={{marginBottom:16}}>
        {[
          ["N° Ordine", order.numero],
          c?["Cliente", c.nome+" "+c.cognome]:null,
          ["Stato", ORDER_STATUSES[order.stato]?.label||"—"],
          order.dataOrdine?["Data ordine", fmtDate(order.dataOrdine)]:null,
          order.prodotti.length>0?["Articoli", order.prodotti.length+" articolo/i"]:null,
          totAccMsg>0?["Acconto totale", totAccMsg.toFixed(2)+" €"]:null,
        ].filter(Boolean).map(([l,v],i,arr)=><IOSRow key={l} label={l} value={v} last={i===arr.length-1}/>)}
      </IOSCard>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <button onClick={doPrint} style={{background:"linear-gradient(135deg,#C9A227,#B8860B)",border:"none",borderRadius:18,padding:"18px 12px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}><span style={{fontSize:34}}>🖨️</span><span style={{fontSize:15,fontWeight:700,color:"white"}}>Stampa etichette</span></button>
        <button onClick={()=>{doPrint();setTimeout(doWA,800);}} style={{background:"linear-gradient(135deg,#34C759,#059669)",border:"none",borderRadius:18,padding:"18px 12px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}><span style={{fontSize:34}}>📤</span><span style={{fontSize:15,fontWeight:700,color:"white"}}>Stampa + Invia</span></button>
      </div>
      <div style={{background:C.white,borderRadius:16,padding:14,marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:C.secondary,marginBottom:12}}>📱 INVIA FORMATO ELETTRONICO</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {[{fn:doWA,dis:!c?.telefono,ico:"💬",l:"WhatsApp",bg:"#ECFDF5",col:"#16A34A"},{fn:doEmail,dis:!c?.email,ico:"📧",l:"Email",bg:"#EFF6FF",col:"#1D4ED8"},{fn:doSMS,dis:!c?.telefono,ico:"📱",l:"SMS",bg:"#F5F3FF",col:"#7C3AED"}].map(({fn,dis,ico,l,bg,col})=>(
            <button key={l} onClick={fn} disabled={dis} style={{background:bg,border:"none",borderRadius:14,padding:"14px 8px",cursor:"pointer",opacity:dis?.35:1,display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
              <span style={{fontSize:26}}>{ico}</span><span style={{fontSize:12,fontWeight:700,color:col}}>{l}</span>
            </button>
          ))}
        </div>
      </div>
      <Btn label="Chiudi" variant="secondary" full onClick={onClose}/>
    </Sheet>
  );
}

function ReceiptModal({repair:r,customer:c,onClose}) {
  const msg=`Gentile ${c.nome} ${c.cognome},\nRicevuta n° ${r.numero}\nOggetto: ${r.descrizione}\n${r.problema?"Lavoro: "+r.problema+"\n":""}Consegna prevista: ${fmtDate(r.dataConsegna)||"da definire"}\nPreventivo: ${r.preventivo?r.preventivo+" €":"da definire"}\n\nGrazie per la fiducia!\n${SHOP.nome}\n${SHOP.indirizzo}, ${SHOP.citta}\nTel. ${SHOP.tel}`;
  const doPrint=()=>{
    try{smartPrint(receiptHTML(r,c));}
    catch(e){console.error("doPrint:",e);alert("Errore stampa: "+e.message);}
  };
  const doWA=()=>{const p=fullPhone(c);if(p)window.open("https://wa.me/"+p+"?text="+encodeURIComponent(msg),"_blank");};
  const doEmail=()=>window.open("mailto:"+c.email+"?subject="+encodeURIComponent("Ricevuta "+r.numero)+"&body="+encodeURIComponent(msg));
  const doSMS=()=>{const p=fullPhone(c);if(p)window.open("sms:+"+p+"?body="+encodeURIComponent(msg));};
  return (
    <Sheet onClose={onClose} title={"Etichette "+r.numero}>
      {r.fotoUrl&&<img src={r.fotoUrl} alt="oggetto" style={{width:"100%",maxHeight:160,objectFit:"cover",borderRadius:14,marginBottom:12}}/>}
      <IOSCard style={{marginBottom:16}}>
        {[["N° Ricevuta",r.numero],["Cliente",c.nome+" "+c.cognome],["Oggetto",r.descrizione],r.tipoLavoro?["Lavoro",r.tipoLavoro]:null,r.mano?["Anello","Mano "+r.mano+" · "+r.dito]:null,["Data ricevuta",fmtDate(r.dataRicevuta)],["Consegna",fmtDate(r.dataConsegna)||"—"],["Preventivo",(r.preventivo?r.preventivo+" €":"Da definire")+(r.preventivoAccettato?" ✅":"")],r.richiestaPreventivo?["Prev. fornitore","⏳ Richiesto"]:null].filter(Boolean).map(([l,v],i,arr)=><IOSRow key={l} label={l} value={v} last={i===arr.length-1}/>)}
      </IOSCard>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <button onClick={doPrint} style={{background:"linear-gradient(135deg,#C9A227,#B8860B)",border:"none",borderRadius:18,padding:"18px 12px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}><span style={{fontSize:34}}>🖨️</span><span style={{fontSize:15,fontWeight:700,color:"white"}}>Stampa etichette</span></button>
        <button onClick={()=>{doPrint();setTimeout(doWA,800);}} style={{background:"linear-gradient(135deg,#34C759,#059669)",border:"none",borderRadius:18,padding:"18px 12px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}><span style={{fontSize:34}}>📤</span><span style={{fontSize:15,fontWeight:700,color:"white"}}>Stampa + Invia</span></button>
      </div>
      <div style={{background:C.white,borderRadius:16,padding:14,marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:C.secondary,marginBottom:12}}>📱 INVIA FORMATO ELETTRONICO</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {[{fn:doWA,dis:!c.telefono,ico:"💬",l:"WhatsApp",bg:"#ECFDF5",col:"#16A34A"},{fn:doEmail,dis:!c.email,ico:"📧",l:"Email",bg:"#EFF6FF",col:"#1D4ED8"},{fn:doSMS,dis:!c.telefono,ico:"📱",l:"SMS",bg:"#F5F3FF",col:"#7C3AED"}].map(({fn,dis,ico,l,bg,col})=>(
            <button key={l} onClick={fn} disabled={dis} style={{background:bg,border:"none",borderRadius:14,padding:"14px 8px",cursor:"pointer",opacity:dis?.35:1,display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
              <span style={{fontSize:26}}>{ico}</span><span style={{fontSize:12,fontWeight:700,color:col}}>{l}</span>
            </button>
          ))}
        </div>
      </div>
      <Btn label="Chiudi" variant="secondary" full onClick={onClose}/>
    </Sheet>
  );
}

/* ── Repair Detail ── */
function RepairDetail({repair:r,customer:c,ddt,onClose,onReceipt,onStatusChange,onTogglePrev,onToggleRichPrev,onToggleInterna,onDelete,onDateChange,onConsegna,onPreventivoChange,onAccontoChange,onSpesaChange,onPrezzoFinaleChange}) {
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [editPrev,setEditPrev]=useState(false);
  const [prevInput,setPrevInput]=useState("");
  const [editAcc,setEditAcc]=useState(false);
  const [accInput,setAccInput]=useState("");
  const [editSpesa,setEditSpesa]=useState(false);
  const [spesaInput,setSpesaInput]=useState("");
  const [editFinale,setEditFinale]=useState(false);
  const [finaleInput,setFinaleInput]=useState("");
  const catIcon=CATS.find(x=>x.id===r.categoria)?.icon||"💍";
  const startEditPrev=()=>{setPrevInput(r.preventivo!=null?String(r.preventivo):"");setEditPrev(true);};
  const savePrev=()=>{onPreventivoChange(r.id,prevInput===""?null:parseFloat(prevInput)||null);setEditPrev(false);};
  const startEditAcc=()=>{setAccInput(r.acconto!=null?String(r.acconto):"");setEditAcc(true);};
  const saveAcc=()=>{onAccontoChange(r.id,accInput===""?null:parseFloat(accInput)||null);setEditAcc(false);};
  const startEditSpesa=()=>{setSpesaInput(r.spesa!=null?String(r.spesa):"");setEditSpesa(true);};
  const saveSpesa=()=>{onSpesaChange&&onSpesaChange(r.id,spesaInput===""?null:parseFloat(spesaInput)||null);setEditSpesa(false);};
  const startEditFinale=()=>{setFinaleInput(r.prezzoFinale!=null?String(r.prezzoFinale):"");setEditFinale(true);};
  const saveFinale=()=>{onPrezzoFinaleChange&&onPrezzoFinaleChange(r.id,finaleInput===""?null:parseFloat(finaleInput)||null);setEditFinale(false);};
  return (
    <Sheet onClose={onClose} title={r.numero}>
      {r.fotoUrl&&<img src={r.fotoUrl} alt="oggetto" style={{width:"100%",maxHeight:180,objectFit:"cover",borderRadius:14,marginBottom:12}}/>}
      <div style={{display:"flex",alignItems:"center",gap:14,background:C.white,borderRadius:20,padding:16,marginBottom:12}}>
        <div style={{width:54,height:54,borderRadius:27,background:STATUSES[r.status]?.bg||"#EFF6FF",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>{catIcon}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:4}}><IOSBadge status={r.status}/>{ddt&&<span style={{fontSize:11,background:"#F5F3FF",color:C.purple,padding:"2px 8px",borderRadius:10,fontWeight:600}}>{ddt.numero}</span>}</div>
          <div style={{fontSize:15,fontWeight:700,color:C.label}}>{r.descrizione}</div>
          <div style={{fontSize:13,color:C.secondary,marginTop:2}}>{r.categoria}{r.tipoLavoro?" · "+r.tipoLavoro:""}{r.mano?" · Mano "+r.mano+" "+r.dito:""}</div>
        </div>
      </div>
      <IOSCard style={{marginBottom:12}}>
        {c&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",borderBottom:(!r.materiali&&!r.problema)?"none":"1px solid #F2F2F7"}}>
          <span style={{fontSize:19,width:26,textAlign:"center",flexShrink:0}}>👤</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:15,fontWeight:600,color:C.label}}>{c.nome} {c.cognome}</div>
            {(displayPhone(c)||c.email)&&<div style={{fontSize:13,color:C.secondary,marginTop:2}}>{displayPhone(c)||c.email}</div>}
          </div>
          <WABtn customer={c} size={32}/>
        </div>}
        {r.materiali&&<IOSRow icon="🪙" label="Materiali" value={r.materiali}/>}
        {r.problema&&<IOSRow icon="🔍" label="Problema" sub={r.problema} last/>}
      </IOSCard>
      <IOSCard style={{marginBottom:12}}>
        <IOSRow icon="📅" label="Ricevuta" value={fmtDate(r.dataRicevuta)}/>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",borderBottom:"1px solid #F2F2F7"}}>
          <span style={{fontSize:19,width:26,textAlign:"center",flexShrink:0}}>📅</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,color:C.secondary,fontWeight:500,marginBottom:2}}>Consegna</div>
            <input type="date" value={r.dataConsegna||""} onChange={e=>onDateChange(r.id,e.target.value||null)}
              style={{fontSize:15,color:C.label,border:"none",background:"transparent",outline:"none",padding:0,fontFamily:"-apple-system,sans-serif",width:"100%",cursor:"pointer"}}/>
          </div>
        </div>
        {/* Spesa (costo riparazione) */}
        {editSpesa
          ?<div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px",borderBottom:"1px solid #F2F2F7"}}>
              <span style={{fontSize:19,width:26,textAlign:"center",flexShrink:0}}>💸</span>
              <input autoFocus type="number" step="0.01" placeholder="0.00" value={spesaInput} onChange={e=>setSpesaInput(e.target.value)}
                style={{flex:1,fontSize:15,border:"1px solid #E11D48",borderRadius:8,padding:"5px 8px",outline:"none",fontFamily:"-apple-system,sans-serif"}}/>
              <span style={{fontSize:12,color:C.secondary,flexShrink:0}}>€</span>
              <button onClick={saveSpesa} style={{background:"#059669",border:"none",borderRadius:8,padding:"5px 10px",color:"white",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>✓</button>
              <button onClick={()=>setEditSpesa(false)} style={{background:"#E5E5EA",border:"none",borderRadius:8,padding:"5px 10px",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>✕</button>
            </div>
          :<div style={{display:"flex",alignItems:"center",gap:8,padding:"11px 16px",borderBottom:"1px solid #F2F2F7"}}>
              <span style={{fontSize:19,width:26,textAlign:"center",flexShrink:0}}>💸</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:C.secondary,fontWeight:500}}>Costo riparazione</div>
                <div style={{fontSize:15,color:r.spesa!=null?C.label:C.secondary,fontWeight:r.spesa!=null?600:400}}>{r.spesa!=null?r.spesa+" €":"Non registrato"}</div>
              </div>
              <button onClick={startEditSpesa} style={{background:"#FFF1F2",border:"none",borderRadius:8,padding:"5px 9px",color:"#E11D48",fontSize:13,cursor:"pointer",flexShrink:0}}>✏️</button>
            </div>
        }
        {/* Prezzo finale */}
        {editFinale
          ?<div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px",borderBottom:"1px solid #F2F2F7"}}>
              <span style={{fontSize:19,width:26,textAlign:"center",flexShrink:0}}>💰</span>
              <input autoFocus type="number" step="0.01" placeholder="0.00" value={finaleInput} onChange={e=>setFinaleInput(e.target.value)}
                style={{flex:1,fontSize:15,border:"1px solid #059669",borderRadius:8,padding:"5px 8px",outline:"none",fontFamily:"-apple-system,sans-serif"}}/>
              <span style={{fontSize:12,color:C.secondary,flexShrink:0}}>€</span>
              <button onClick={saveFinale} style={{background:"#059669",border:"none",borderRadius:8,padding:"5px 10px",color:"white",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>✓</button>
              <button onClick={()=>setEditFinale(false)} style={{background:"#E5E5EA",border:"none",borderRadius:8,padding:"5px 10px",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>✕</button>
            </div>
          :<div style={{display:"flex",alignItems:"center",gap:8,padding:"11px 16px",borderBottom:"1px solid #F2F2F7"}}>
              <span style={{fontSize:19,width:26,textAlign:"center",flexShrink:0}}>💰</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:C.secondary,fontWeight:500}}>Prezzo finale</div>
                <div style={{fontSize:15,color:r.prezzoFinale?C.green:C.secondary,fontWeight:r.prezzoFinale?700:400}}>{r.prezzoFinale?r.prezzoFinale+" €":"Non definito"}</div>
              </div>
              <button onClick={startEditFinale} style={{background:"#ECFDF5",border:"none",borderRadius:8,padding:"5px 9px",color:"#059669",fontSize:13,cursor:"pointer",flexShrink:0}}>✏️</button>
            </div>
        }
        {/* Preventivo (solo se prezzo finale non ancora definito) */}
        {!r.prezzoFinale&&(
          editPrev
            ?<div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px",borderBottom:"1px solid #F2F2F7"}}>
                <span style={{fontSize:19,width:26,textAlign:"center",flexShrink:0}}>📋</span>
                <input autoFocus type="number" step="0.01" placeholder="0.00" value={prevInput} onChange={e=>setPrevInput(e.target.value)}
                  style={{flex:1,fontSize:15,border:"1px solid #C9A227",borderRadius:8,padding:"5px 8px",outline:"none",fontFamily:"-apple-system,sans-serif"}}/>
                <span style={{fontSize:12,color:C.secondary,flexShrink:0}}>€</span>
                <button onClick={savePrev} style={{background:"#059669",border:"none",borderRadius:8,padding:"5px 10px",color:"white",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>✓</button>
                <button onClick={()=>setEditPrev(false)} style={{background:"#E5E5EA",border:"none",borderRadius:8,padding:"5px 10px",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>✕</button>
              </div>
            :<div style={{display:"flex",alignItems:"center",gap:8,padding:"11px 16px",borderBottom:"1px solid #F2F2F7"}}>
                <span style={{fontSize:19,width:26,textAlign:"center",flexShrink:0}}>📋</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,color:C.secondary,fontWeight:500}}>Preventivo</div>
                  <div style={{fontSize:15,color:r.preventivo?C.label:C.secondary,fontWeight:r.preventivo?600:400}}>{r.preventivo?r.preventivo+" €":"Da definire"}</div>
                </div>
                <button onClick={startEditPrev} style={{background:"#FDF6DC",border:"none",borderRadius:8,padding:"5px 9px",color:"#B8860B",fontSize:13,cursor:"pointer",flexShrink:0}}>✏️</button>
              </div>
        )}
        {editAcc
          ?<div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px",borderBottom:"1px solid #F2F2F7"}}>
              <span style={{fontSize:19,width:26,textAlign:"center",flexShrink:0}}>✅</span>
              <input autoFocus type="number" step="0.01" placeholder="0.00" value={accInput} onChange={e=>setAccInput(e.target.value)}
                style={{flex:1,fontSize:15,border:"1px solid #059669",borderRadius:8,padding:"5px 8px",outline:"none",fontFamily:"-apple-system,sans-serif"}}/>
              <span style={{fontSize:12,color:C.secondary,flexShrink:0}}>€</span>
              <button onClick={saveAcc} style={{background:"#059669",border:"none",borderRadius:8,padding:"5px 10px",color:"white",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>✓</button>
              <button onClick={()=>setEditAcc(false)} style={{background:"#E5E5EA",border:"none",borderRadius:8,padding:"5px 10px",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>✕</button>
            </div>
          :<div style={{display:"flex",alignItems:"center",gap:8,padding:"11px 16px",borderBottom:"1px solid #F2F2F7"}}>
              <span style={{fontSize:19,width:26,textAlign:"center",flexShrink:0}}>✅</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:C.secondary,fontWeight:500}}>Acconto</div>
                <div style={{fontSize:15,color:r.acconto?C.green:C.secondary,fontWeight:r.acconto?600:400}}>{r.acconto?r.acconto+" €":"Non registrato"}</div>
              </div>
              <button onClick={startEditAcc} style={{background:"#ECFDF5",border:"none",borderRadius:8,padding:"5px 9px",color:"#059669",fontSize:13,cursor:"pointer",flexShrink:0}}>✏️</button>
            </div>
        }
        {r.dataSpedita&&<IOSRow icon="📤" label="Spedita al fornitore" value={fmtDate(r.dataSpedita)}/>}
        {r.dataRientrata&&<IOSRow icon="📥" label="Rientrata dal fornitore" value={fmtDate(r.dataRientrata)}/>}
        {r.dataConsegnata&&<IOSRow icon="🤝" label="Consegnata al cliente" value={fmtDate(r.dataConsegnata)}/>}
        <IOSRow icon="🔢" label="Numero" value={r.numero} last/>
      </IOSCard>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:12}}>
        <Toggle label="✅ Preventivo accettato dal cliente" value={r.preventivoAccettato||false} onChange={()=>onTogglePrev(r)}/>
        <Toggle label="⏳ Richiesta preventivo al fornitore" value={r.richiestaPreventivo||false} onChange={()=>onToggleRichPrev(r)}/>
        <Toggle label="🏠 Riparazione interna" value={r.riparazioneInterna||false} onChange={()=>onToggleInterna(r)} sub="Gestita internamente, senza invio al riparatore"/>
      </div>
      <div style={{background:C.white,borderRadius:16,padding:14,marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:700,color:C.secondary,marginBottom:10}}>CAMBIA STATO</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {Object.entries(STATUSES).map(([k,v])=><button key={k} onClick={()=>onStatusChange(r.id,k)} style={{padding:"8px 14px",borderRadius:20,border:"none",background:r.status===k?v.bg:"#F2F2F7",color:r.status===k?v.color:C.secondary,fontSize:13,fontWeight:r.status===k?700:500,cursor:"pointer",transition:"all .15s"}}>{v.label}</button>)}
        </div>
      </div>
      {r.status==="pronto"&&(
        <button onClick={()=>onConsegna(r,c)} style={{width:"100%",background:"linear-gradient(135deg,#059669,#047857)",border:"none",borderRadius:18,padding:"18px 16px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:12,boxShadow:"0 4px 20px rgba(5,150,105,.35)"}}>
          <span style={{fontSize:30}}>🤝</span>
          <div style={{textAlign:"left"}}>
            <div style={{fontSize:17,fontWeight:800,color:"white"}}>Consegna al cliente</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.8)"}}>Segna come consegnato e invia ricevuta</div>
          </div>
        </button>
      )}
      <Btn label="🧾 Etichette" full onClick={()=>onReceipt(r,c)}/>
      <div style={{height:10}}/>
      {!confirmDelete
        ?<Btn label="🗑️ Elimina riparazione" variant="red" full onClick={()=>setConfirmDelete(true)}/>
        :<div style={{background:"#FFF1F2",borderRadius:14,padding:14,border:"1px solid #FECDD3"}}><div style={{fontSize:14,fontWeight:600,color:C.red,marginBottom:12}}>⚠️ Eliminare? Rimarrà nell'archivio eliminati.</div><div style={{display:"flex",gap:10}}><Btn label="Annulla" variant="secondary" full onClick={()=>setConfirmDelete(false)}/><Btn label="Elimina" variant="red" full onClick={onDelete}/></div></div>}
    </Sheet>
  );
}

/* ── Customer Detail ── */
function CustomerDetail({customer:c,repairs,onClose,onEdit,onOpenRepair,onReceipt,onDelete}) {
  const [confirmDelete,setConfirmDelete]=useState(false);
  const attive=repairs.filter(r=>r.status!=="consegnato");
  return (
    <Sheet onClose={onClose} title={c.nome+" "+c.cognome}>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{width:72,height:72,borderRadius:36,background:"#FDF6DC",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:800,color:"#B8860B",marginBottom:8}}>{c.nome?.[0]}{c.cognome?.[0]}</div>
        <div style={{fontSize:20,fontWeight:800,color:C.label}}>{c.nome} {c.cognome}</div>
        <div style={{fontSize:13,color:C.secondary}}>{repairs.length} riparazione/i{attive.length>0?` · ${attive.length} attive`:""}</div>
      </div>
      <IOSCard style={{marginBottom:16}}>
        {c.telefono&&<div style={{display:"flex",alignItems:"center",padding:"11px 16px",borderBottom:"1px solid #F2F2F7",gap:10}}>
          <span style={{fontSize:19,width:26,textAlign:"center",flexShrink:0}}>📞</span>
          <button onClick={()=>window.open("tel:"+fullPhone(c))} style={{flex:1,minWidth:0,background:"none",border:"none",cursor:"pointer",textAlign:"left",padding:0,fontSize:15,color:C.label,fontFamily:"-apple-system,sans-serif"}}>{displayPhone(c)}</button>
          <WABtn customer={c} size={32}/>
        </div>}
        {c.email&&<IOSRow icon="📧" label={c.email} onPress={()=>window.open("mailto:"+c.email)}/>}
        {c.indirizzo&&<IOSRow icon="📍" label={c.indirizzo}/>}
        {c.codiceFiscale&&<IOSRow icon="🪪" label={c.codiceFiscale} last/>}
      </IOSCard>
      {repairs.length>0&&<><SectionTitle>Storico riparazioni</SectionTitle>{repairs.sort((a,b)=>(b.dataRicevuta||"").localeCompare(a.dataRicevuta||"")).map(r=>(
        <button key={r.id} onClick={()=>onOpenRepair(r)} style={{width:"100%",background:C.white,borderRadius:14,padding:"12px 14px",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:12,marginBottom:8,boxShadow:"0 1px 3px rgba(0,0,0,.07)",textAlign:"left"}}>
          <div style={{flex:1,minWidth:0}}><div style={{display:"flex",gap:8,marginBottom:4}}><span style={{fontSize:14,fontWeight:700,color:C.label}}>{r.numero}</span><IOSBadge status={r.status}/></div><div style={{fontSize:13,color:C.secondary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.descrizione}</div></div>
          <button onClick={e=>{e.stopPropagation();onReceipt(r,c);}} style={{background:"#FDF6DC",border:"none",borderRadius:8,width:32,height:32,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>🧾</button>
        </button>
      ))}</>}
      <Btn label="📱 Salva in Rubrica" variant="secondary" full onClick={()=>saveToContacts(c)}/>
      <div style={{height:8}}/>
      <Btn label="✏️ Modifica cliente" variant="secondary" full onClick={()=>onEdit(c)}/>
      <div style={{height:10}}/>
      {!confirmDelete
        ?<Btn label="🗑️ Elimina cliente" variant="red" full onClick={()=>setConfirmDelete(true)}/>
        :<div style={{background:"#FFF1F2",borderRadius:14,padding:14,border:"1px solid #FECDD3"}}>
          <div style={{fontSize:14,fontWeight:600,color:C.red,marginBottom:6}}>⚠️ Eliminare {c.nome} {c.cognome}?</div>
          {attive.length>0&&<div style={{fontSize:13,color:C.red,marginBottom:10}}>Ha {attive.length} riparazione/i ancora attiva/e.</div>}
          <div style={{fontSize:13,color:"#666",marginBottom:12}}>Le riparazioni associate rimarranno nel sistema.</div>
          <div style={{display:"flex",gap:10}}>
            <Btn label="Annulla" variant="secondary" full onClick={()=>setConfirmDelete(false)}/>
            <Btn label="Elimina" variant="red" full onClick={()=>onDelete(c.id)}/>
          </div>
        </div>
      }
    </Sheet>
  );
}

/* ── Customer Form ── */
function CustomerForm({customer,onSave,onClose}) {
  const [f,setF]=useState(customer||{nome:"",cognome:"",telefono:"",telefonoPrefisso:"+39",email:"",indirizzo:"",codiceFiscale:"",note:""});
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const [imgB64,setImgB64]=useState(null);const [aiLoad,setAiLoad]=useState(false);const [msg,setMsg]=useState("");
  const ref=useRef();
  const scan=async()=>{if(!imgB64)return;setAiLoad(true);const res=await aiCall('Analizza documento d\'identità italiano. SOLO JSON: {"nome":"","cognome":"","codiceFiscale":"","indirizzo":""}',imgB64);if(!res){setMsg("⚠️ AI non configurata");setAiLoad(false);return;}try{const j=JSON.parse(res.replace(/```json|```/g,"").trim());setF(x=>({...x,nome:j.nome||x.nome,cognome:j.cognome||x.cognome,codiceFiscale:j.codiceFiscale||x.codiceFiscale,indirizzo:j.indirizzo||x.indirizzo}));setMsg("✅ Dati estratti");}catch{setMsg("⚠️ Inserisci manualmente");}setAiLoad(false);};
  return (
    <Sheet onClose={onClose} title={customer?"Modifica Cliente":"Nuovo Cliente"}>
      {aiEnabled&&(<div style={{background:"#F0F4FF",borderRadius:14,padding:12,marginBottom:16,border:"1px solid #C7D2FE"}}><div style={{fontSize:12,fontWeight:700,color:"#3B5EDB",marginBottom:8}}>🤖 Scansione documento d'identità</div><div style={{display:"flex",gap:8}}><button onClick={()=>ref.current.click()} style={{flex:1,border:"1px solid #C7D2FE",borderRadius:10,padding:10,background:"white",color:"#3B5EDB",fontSize:13,fontWeight:600,cursor:"pointer"}}>{imgB64?"📄 ✓ Caricato":"📷 Carica doc"}</button><button onClick={scan} disabled={!imgB64||aiLoad} style={{flex:1,background:"#3B5EDB",color:"white",border:"none",borderRadius:10,padding:10,fontSize:13,fontWeight:700,cursor:"pointer",opacity:(!imgB64||aiLoad)?.4:1}}>{aiLoad?"⏳…":"🔍 Leggi AI"}</button></div><input ref={ref} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{const fi=e.target.files?.[0];if(!fi)return;const r=new FileReader();r.onload=ev=>setImgB64(ev.target.result.split(",")[1]);r.readAsDataURL(fi);}}/>{msg&&<div style={{fontSize:12,color:"#3B5EDB",marginTop:6}}>{msg}</div>}</div>)}
      <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><IOSInput placeholder="Nome *" value={f.nome} onChange={e=>set("nome",e.target.value)}/><IOSInput placeholder="Cognome *" value={f.cognome} onChange={e=>set("cognome",e.target.value)}/></div>
        <div><div style={{fontSize:13,fontWeight:600,color:C.secondary,marginBottom:6}}>Telefono</div><PhoneInput prefisso={f.telefonoPrefisso} telefono={f.telefono} onPrefisso={v=>set("telefonoPrefisso",v)} onTelefono={v=>set("telefono",v)}/></div>
        <IOSInput placeholder="Email" type="email" value={f.email||""} onChange={e=>set("email",e.target.value)}/>
        <IOSInput placeholder="Indirizzo" value={f.indirizzo||""} onChange={e=>set("indirizzo",e.target.value)}/>
        <IOSInput placeholder="Codice Fiscale" value={f.codiceFiscale||""} onChange={e=>set("codiceFiscale",e.target.value.toUpperCase())}/>
      </div>
      <div style={{display:"flex",gap:10}}><Btn label="Annulla" variant="secondary" full onClick={onClose}/><Btn label="Salva" full disabled={!f.nome||!f.cognome} onClick={()=>onSave(f)}/></div>
    </Sheet>
  );
}

/* ── Gestione Duplicati ── */
function DuplicatesModal({customers,repairs,onDelete,onClose}) {
  const normKey=(c)=>`${(c.nome||"").trim().toLowerCase()} ${(c.cognome||"").trim().toLowerCase()}`.trim();

  /* Raggruppa per nome normalizzato */
  const groups=Object.values(
    customers.reduce((acc,c)=>{
      const k=normKey(c);
      if(!k)return acc;
      if(!acc[k])acc[k]=[];
      acc[k].push(c);
      return acc;
    },{})
  ).filter(g=>g.length>1);

  /* Raggruppa per telefono (solo se il telefono è presente) */
  const byPhone=Object.values(
    customers.reduce((acc,c)=>{
      const tel=(c.telefono||"").replace(/\D/g,"").trim();
      if(!tel)return acc;
      if(!acc[tel])acc[tel]=[];
      acc[tel].push(c);
      return acc;
    },{})
  ).filter(g=>g.length>1);

  /* Unisci i gruppi evitando duplicati */
  const allGroups=[...groups];
  byPhone.forEach(pg=>{
    const ids=new Set(pg.map(c=>c.id));
    const already=allGroups.some(g=>g.some(c=>ids.has(c.id)));
    if(!already)allGroups.push(pg);
  });

  /* Seleziona di default tutti tranne il primo per ogni gruppo */
  const [toDelete,setToDelete]=useState(()=>{
    const set=new Set();
    allGroups.forEach(g=>{g.slice(1).forEach(c=>set.add(c.id));});
    return set;
  });
  const [deleting,setDeleting]=useState(false);

  const toggle=(id)=>setToDelete(prev=>{
    const n=new Set(prev);
    n.has(id)?n.delete(id):n.add(id);
    return n;
  });

  const handleDelete=async()=>{
    setDeleting(true);
    for(const id of toDelete) await onDelete(id);
    setDeleting(false);
    onClose();
  };

  if(allGroups.length===0) return (
    <Sheet onClose={onClose} title="🔍 Duplicati">
      <div style={{textAlign:"center",padding:"40px 20px"}}>
        <div style={{fontSize:48,marginBottom:12}}>✅</div>
        <div style={{fontSize:17,fontWeight:700,color:"#1c1c1e",marginBottom:8}}>Nessun duplicato trovato</div>
        <div style={{fontSize:14,color:"#6B7280"}}>Tutti i clienti sembrano unici.</div>
      </div>
      <Btn label="Chiudi" full onClick={onClose}/>
    </Sheet>
  );

  const repCount=(id)=>repairs.filter(r=>r.customerId===id).length;

  return (
    <Sheet onClose={onClose} title="🔍 Duplicati clienti">
      <div style={{fontSize:14,color:"#6B7280",marginBottom:16}}>
        Trovati <strong>{allGroups.length} gruppi</strong> con clienti duplicati. Seleziona quelli da eliminare (i selezionati verranno cancellati).
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:20}}>
        {allGroups.map((group,gi)=>(
          <div key={gi} style={{background:"#F9FAFB",borderRadius:14,padding:12,border:"1px solid #E5E7EB"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>
              Gruppo {gi+1} — {group.length} clienti
            </div>
            {group.map((c,ci)=>{
              const sel=toDelete.has(c.id);
              const nRep=repCount(c.id);
              return (
                <button key={c.id} onClick={()=>toggle(c.id)}
                  style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
                    background:sel?"#FEE2E2":"white",borderRadius:10,
                    border:sel?"1px solid #FCA5A5":"1px solid #E5E7EB",
                    marginBottom:ci<group.length-1?6:0,cursor:"pointer",textAlign:"left"}}>
                  <div style={{width:22,height:22,borderRadius:11,border:`2px solid ${sel?"#EF4444":"#D1D5DB"}`,
                    background:sel?"#EF4444":"white",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {sel&&<span style={{color:"white",fontSize:13,fontWeight:800}}>✕</span>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:600,color:"#1c1c1e"}}>{c.nome} {c.cognome}</div>
                    <div style={{fontSize:12,color:"#6B7280"}}>{displayPhone(c)||c.email||"—"}</div>
                  </div>
                  {nRep>0&&<span style={{fontSize:11,background:"#EFF6FF",color:"#1D4ED8",padding:"2px 7px",borderRadius:8,fontWeight:700,flexShrink:0}}>{nRep} rip.</span>}
                  {ci===0&&<span style={{fontSize:10,background:"#ECFDF5",color:"#059669",padding:"2px 7px",borderRadius:8,fontWeight:700,flexShrink:0}}>primo</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{background:"#FFF1F2",borderRadius:12,padding:12,marginBottom:16,fontSize:13,color:"#B91C1C"}}>
        ⚠️ Verranno eliminati <strong>{toDelete.size} clienti</strong>. Le riparazioni associate verranno orfanate.
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn label="Annulla" variant="secondary" full onClick={onClose}/>
        <Btn label={deleting?"⏳ Eliminazione…":`🗑️ Elimina ${toDelete.size}`} full disabled={toDelete.size===0||deleting} onClick={handleDelete}/>
      </div>
    </Sheet>
  );
}

/* ── Import Contatti da vCard ── */
function ImportContatti({customers,onImport,onClose}) {
  const [step,setStep]=useState(1);       // 1=upload  2=preview  3=done
  const [parsed,setParsed]=useState([]);
  const [selected,setSelected]=useState([]);
  const [dupIds,setDupIds]=useState(new Set()); // indici duplicati per telefono
  const [loading,setLoading]=useState(false);
  const [importedCount,setImportedCount]=useState(0);
  const fileRef=useRef();

  const handleFile=async(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    setLoading(true);
    try{
      /* Prova UTF-8, fallback Latin-1 */
      let text="";
      try{text=await file.text();}
      catch{text=await new Promise((res,rej)=>{const r=new FileReader();r.onload=ev=>res(ev.target.result);r.onerror=rej;r.readAsText(file,"ISO-8859-1");});}

      const contacts=parseVCards(text);
      if(!contacts.length){setLoading(false);return;}

      /* Individua duplicati per numero di telefono */
      const dups=new Set();
      contacts.forEach((c,i)=>{
        if(c.telefono){const exists=customers.some(x=>x.telefono===c.telefono);if(exists)dups.add(i);}
      });

      setParsed(contacts);
      setDupIds(dups);
      /* Pre-seleziona tutti i non-duplicati */
      setSelected(contacts.map((_,i)=>i).filter(i=>!dups.has(i)));
      setStep(2);
    }catch(err){console.error(err);}
    setLoading(false);
  };

  const toggle=(i)=>setSelected(s=>s.includes(i)?s.filter(x=>x!==i):[...s,i]);
  const toggleAll=()=>{
    const nonDup=parsed.map((_,i)=>i).filter(i=>!dupIds.has(i));
    setSelected(s=>s.length===nonDup.length?[]:nonDup);
  };

  const doImport=async()=>{
    const toImport=selected.map(i=>parsed[i]);
    await onImport(toImport);
    setImportedCount(toImport.length);
    setStep(3);
  };

  const dupCount=parsed.filter((_,i)=>dupIds.has(i)).length;
  const newCount=parsed.length-dupCount;

  return(
    <FullScreen onClose={onClose} title={step===1?"📲 Importa contatti":step===2?"📋 Anteprima":"✅ Importazione completata"}>

      {/* ── STEP 1: Upload ── */}
      {step===1&&<div>
        <div style={{textAlign:"center",padding:"30px 0 20px"}}>
          <div style={{fontSize:64,marginBottom:16}}>📲</div>
          <div style={{fontSize:20,fontWeight:800,color:C.label,marginBottom:8}}>Importa da Contatti iPhone</div>
          <div style={{fontSize:14,color:C.secondary,lineHeight:1.6,marginBottom:28}}>
            Esporta i contatti dall'app Contatti del tuo iPhone in formato .vcf (vCard), poi carica il file qui.
          </div>
        </div>

        {/* Istruzioni */}
        <IOSCard style={{marginBottom:20}}>
          {[
            ["1️⃣","Apri l'app Contatti","su iPhone o Mac"],
            ["2️⃣","Seleziona i contatti","uno o più, o tutto il gruppo"],
            ["3️⃣","Condividi → Esporta vCard","scegli il file .vcf"],
            ["4️⃣","Carica qui il file .vcf","e scegli chi importare"],
          ].map(([ico,label,sub],i,arr)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<arr.length-1?"1px solid #F2F2F7":"none"}}>
              <span style={{fontSize:22,flexShrink:0}}>{ico}</span>
              <div><div style={{fontSize:14,fontWeight:600,color:C.label}}>{label}</div><div style={{fontSize:12,color:C.secondary}}>{sub}</div></div>
            </div>
          ))}
        </IOSCard>

        <button onClick={()=>fileRef.current.click()} disabled={loading} style={{width:"100%",background:"linear-gradient(135deg,#007AFF,#0056D6)",border:"none",borderRadius:18,padding:"18px 20px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:12,boxShadow:"0 4px 16px rgba(0,122,255,.3)"}}>
          <span style={{fontSize:28}}>{loading?"⏳":"📂"}</span>
          <span style={{fontSize:17,fontWeight:700,color:"white"}}>{loading?"Lettura in corso…":"Carica file .vcf"}</span>
        </button>
        <input ref={fileRef} type="file" accept=".vcf,text/vcard,text/x-vcard" style={{display:"none"}} onChange={handleFile}/>
      </div>}

      {/* ── STEP 2: Preview ── */}
      {step===2&&<div>
        {/* Riepilogo */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
          {[
            {v:parsed.length,l:"Trovati",bg:"#EFF6FF",col:"#1D4ED8"},
            {v:newCount,l:"Nuovi",bg:"#ECFDF5",col:"#059669"},
            {v:dupCount,l:"Duplicati",bg:"#FFF7ED",col:"#C2410C"},
          ].map(s=>(
            <div key={s.l} style={{background:s.bg,borderRadius:14,padding:"12px 10px",textAlign:"center"}}>
              <div style={{fontSize:24,fontWeight:800,color:s.col}}>{s.v}</div>
              <div style={{fontSize:11,color:s.col,opacity:.75,fontWeight:600}}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Seleziona/deseleziona tutti */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,padding:"0 2px"}}>
          <div style={{fontSize:13,color:C.secondary,fontWeight:600}}>{selected.length} di {newCount} nuovi selezionati</div>
          <button onClick={toggleAll} style={{fontSize:13,color:C.blue,background:"none",border:"none",cursor:"pointer",fontWeight:600}}>
            {selected.length===newCount?"Deseleziona tutti":"Seleziona tutti"}
          </button>
        </div>

        {/* Lista */}
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
          {parsed.map((c,i)=>{
            const isDup=dupIds.has(i);
            const isSel=selected.includes(i);
            return(
              <button key={i} onClick={()=>!isDup&&toggle(i)} style={{background:isDup?"#F9FAFB":isSel?"#EFF6FF":C.white,border:isSel&&!isDup?"2px solid "+C.blue:"2px solid transparent",borderRadius:16,padding:"12px 14px",cursor:isDup?"default":"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",width:"100%",opacity:isDup?.65:1,boxShadow:isDup?"none":"0 1px 3px rgba(0,0,0,.06)"}}>
                {/* Checkbox */}
                {!isDup&&(
                  <div style={{width:26,height:26,borderRadius:13,border:"2px solid "+(isSel?C.blue:"#C7C7CC"),background:isSel?C.blue:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {isSel&&<span style={{color:"white",fontSize:13,fontWeight:700}}>✓</span>}
                  </div>
                )}
                {isDup&&<span style={{fontSize:18,flexShrink:0}}>⚠️</span>}
                {/* Dati contatto */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:2}}>
                    <span style={{fontSize:14,fontWeight:700,color:isDup?C.secondary:C.label}}>{c.nome} {c.cognome}</span>
                    {isDup&&<span style={{fontSize:10,background:"#FFF7ED",color:"#C2410C",padding:"1px 6px",borderRadius:8,fontWeight:700,flexShrink:0}}>già presente</span>}
                  </div>
                  <div style={{fontSize:12,color:C.secondary,display:"flex",gap:8,flexWrap:"wrap"}}>
                    {c.telefono&&<span>📞 {c.telefonoPrefisso} {c.telefono}</span>}
                    {c.email&&<span>✉️ {c.email}</span>}
                  </div>
                  {c.indirizzo&&<div style={{fontSize:11,color:C.secondary,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📍 {c.indirizzo}</div>}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{display:"flex",gap:10}}>
          <Btn label="← Indietro" variant="secondary" full onClick={()=>setStep(1)}/>
          <Btn label={`⬆️ Importa ${selected.length} contatti`} full disabled={selected.length===0} onClick={doImport}/>
        </div>
      </div>}

      {/* ── STEP 3: Done ── */}
      {step===3&&<div style={{textAlign:"center",padding:"40px 20px"}}>
        <div style={{fontSize:72,marginBottom:16}}>✅</div>
        <div style={{fontSize:22,fontWeight:800,color:C.label,marginBottom:8}}>{importedCount} contatt{importedCount===1?"o":"i"} importat{importedCount===1?"o":"i"}!</div>
        <div style={{fontSize:14,color:C.secondary,marginBottom:30}}>I nuovi clienti sono ora disponibili nell'anagrafica.</div>
        <Btn label="Chiudi" full onClick={onClose}/>
      </div>}
    </FullScreen>
  );
}

/* ── DDT Form ── */
function DDTForm({repairs,customers,repairers,existing,onSave,onClose}) {
  const [rip,setRip]=useState(existing?.riparatore||{nome:"",indirizzo:"",piva:"",telefono:""});
  const [selIds,setSelIds]=useState(existing?.riparazioniIds||[]);
  const [note,setNote]=useState(existing?.note||"");
  const [selRipId,setSelRipId]=useState("");
  const [trasporto,setTrasporto]=useState(existing?.riparatore?.trasporto||{
    causale:"Riparazione",aspettoBeni:"Buste sigillate",nColli:"",peso:"",
    vettore:"Mittente",portoFranco:"Franco",dataInizio:today(),oraInizio:""
  });
  const setT=(k,v)=>setTrasporto(t=>({...t,[k]:v}));
  const avail=repairs.filter(r=>!r.eliminata&&r.status!=="consegnato"&&(r.status!=="presso_esterno"||(existing?.riparazioniIds||[]).includes(r.id)));
  const toggle=id=>setSelIds(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const sel2=style=>({width:"100%",background:C.white,border:"none",borderRadius:12,padding:"11px 14px",fontSize:14,fontFamily:"-apple-system,sans-serif",boxShadow:"0 1px 3px rgba(0,0,0,.07)",color:C.label,...style});
  return (
    <Sheet onClose={onClose} title={existing?"Modifica DDT":"Nuovo DDT Riparatore"}>
      <SectionTitle>Riparatore destinatario</SectionTitle>
      {repairers.length>0&&<div style={{marginBottom:10}}><select style={sel2()} value={selRipId} onChange={e=>{setSelRipId(e.target.value);if(e.target.value){const x=repairers.find(r=>r.id===e.target.value);if(x)setRip({nome:x.nome||"",indirizzo:x.indirizzo||"",citta:x.citta||"",provincia:x.provincia||"",cap:x.cap||"",piva:x.piva||"",telefono:x.telefono||""});}}}><option value="">+ Nuovo riparatore…</option>{repairers.map(r=><option key={r.id} value={r.id}>{r.nome}</option>)}</select></div>}
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
        <IOSInput placeholder="Nome riparatore *" value={rip.nome} onChange={e=>setRip(v=>({...v,nome:e.target.value}))}/>
        <IOSInput placeholder="Indirizzo" value={rip.indirizzo||""} onChange={e=>setRip(v=>({...v,indirizzo:e.target.value}))}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <IOSInput placeholder="P.IVA" value={rip.piva||""} onChange={e=>setRip(v=>({...v,piva:e.target.value}))}/>
          <IOSInput placeholder="Telefono" value={rip.telefono||""} onChange={e=>setRip(v=>({...v,telefono:e.target.value}))}/>
        </div>
      </div>

      <SectionTitle>Dati trasporto</SectionTitle>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:12,color:C.secondary,fontWeight:600,marginBottom:4}}>Causale</div>
            <select style={sel2()} value={trasporto.causale} onChange={e=>setT("causale",e.target.value)}>
              {["Riparazione","Lavorazione","Garanzia","Conto lavoro","Reso","Altro"].map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:12,color:C.secondary,fontWeight:600,marginBottom:4}}>Porto</div>
            <select style={sel2()} value={trasporto.portoFranco} onChange={e=>setT("portoFranco",e.target.value)}>
              {["Franco","Assegnato"].map(v=><option key={v}>{v}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div style={{fontSize:12,color:C.secondary,fontWeight:600,marginBottom:4}}>Aspetto esteriore dei beni</div>
          <select style={sel2()} value={trasporto.aspettoBeni} onChange={e=>setT("aspettoBeni",e.target.value)}>
            {["Buste sigillate","Confezione","Imballo","Scatola","Sfuso","Altro"].map(v=><option key={v}>{v}</option>)}
          </select>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:12,color:C.secondary,fontWeight:600,marginBottom:4}}>N. colli</div>
            <IOSInput placeholder="es. 1" type="number" value={trasporto.nColli} onChange={e=>setT("nColli",e.target.value)}/>
          </div>
          <div>
            <div style={{fontSize:12,color:C.secondary,fontWeight:600,marginBottom:4}}>Peso lordo (kg)</div>
            <IOSInput placeholder="es. 0.5" type="number" value={trasporto.peso} onChange={e=>setT("peso",e.target.value)}/>
          </div>
        </div>
        <div>
          <div style={{fontSize:12,color:C.secondary,fontWeight:600,marginBottom:4}}>Vettore</div>
          <select style={sel2()} value={trasporto.vettore} onChange={e=>setT("vettore",e.target.value)}>
            {["Mittente","Destinatario","SDA","BRT","DHL","GLS","TNT","Poste Italiane","Altro"].map(v=><option key={v}>{v}</option>)}
          </select>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:12,color:C.secondary,fontWeight:600,marginBottom:4}}>Data inizio trasporto</div>
            <input type="date" value={trasporto.dataInizio} onChange={e=>setT("dataInizio",e.target.value)} style={{...sel2(),padding:"10px 14px"}}/>
          </div>
          <div>
            <div style={{fontSize:12,color:C.secondary,fontWeight:600,marginBottom:4}}>Ora inizio</div>
            <input type="time" value={trasporto.oraInizio} onChange={e=>setT("oraInizio",e.target.value)} style={{...sel2(),padding:"10px 14px"}}/>
          </div>
        </div>
      </div>

      <SectionTitle>{existing?"Oggetti nel DDT":"Oggetti da inviare"} ({selIds.length} selezionati)</SectionTitle>
      {avail.length===0
        ?<div style={{textAlign:"center",padding:20,color:C.secondary,background:C.white,borderRadius:14}}>Nessuna riparazione disponibile</div>
        :<div style={{maxHeight:260,overflowY:"auto",display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
          {avail.map(r=>{
            const c=customers.find(x=>x.id===r.customerId);const sel=selIds.includes(r.id);
            const wasInDDT=existing&&(existing.riparazioniIds||[]).includes(r.id);
            return(
              <button key={r.id} onClick={()=>toggle(r.id)} style={{background:sel?"#F5F3FF":C.white,border:sel?"2px solid #7C3AED":"2px solid transparent",borderRadius:14,padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
                <div style={{width:24,height:24,borderRadius:12,border:"2px solid "+(sel?C.purple:"#C7C7CC"),background:sel?C.purple:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{sel&&<span style={{color:"white",fontSize:12,fontWeight:700}}>✓</span>}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",gap:8,marginBottom:2,flexWrap:"wrap"}}>
                    <span style={{fontSize:14,fontWeight:700,color:C.label}}>{r.numero}</span>
                    <IOSBadge status={r.status}/>
                    {wasInDDT&&!sel&&<span style={{fontSize:11,background:"#FFF1F2",color:C.red,padding:"2px 6px",borderRadius:6,fontWeight:600}}>rimosso</span>}
                    {!wasInDDT&&sel&&existing&&<span style={{fontSize:11,background:"#ECFDF5",color:"#059669",padding:"2px 6px",borderRadius:6,fontWeight:600}}>aggiunto</span>}
                    {r.richiestaPreventivo&&<span style={{fontSize:11,color:C.purple,fontWeight:600}}>⏳</span>}
                  </div>
                  <div style={{fontSize:13,color:C.secondary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.descrizione}{c?" · "+c.cognome:""}</div>
                </div>
              </button>
            );
          })}
        </div>
      }
      <IOSTextarea label="Note" placeholder="Note per il riparatore…" value={note} onChange={e=>setNote(e.target.value)}/>
      <div style={{height:14}}/>
      <div style={{display:"flex",gap:10}}><Btn label="Annulla" variant="secondary" full onClick={onClose}/><Btn label={existing?"🖨️ Salva e ristampa":"📄 Crea DDT e stampa"} variant="purple" full disabled={!rip.nome||selIds.length===0} onClick={()=>onSave({rip:{...rip,trasporto},selIds,note,selRipId})}/></div>
    </Sheet>
  );
}

/* ── DDT Detail ── */
function DDTDetail({ddt,repairs,customers,onClose,onReturn,onPrint,onEdit,onDelete}) {
  const [confirmDelete,setConfirmDelete]=useState(false);
  const items=repairs.filter(r=>ddt.riparazioniIds?.includes(r.id));

  /* Calcola totali */
  const totSpesa=items.reduce((s,r)=>s+(parseFloat(r.spesa)||0),0);
  const totRicavi=items.reduce((s,r)=>s+(parseFloat(r.prezzoFinale)||0),0);
  const totMargine=totRicavi-totSpesa;
  const hasCosts=items.some(r=>r.spesa||r.prezzoFinale);

  return (
    <Sheet onClose={onClose} title={ddt.numero}>
      <IOSCard style={{marginBottom:12}}>
        <IOSRow icon="🏢" label={ddt.riparatore?.nome||"—"} sub={ddt.riparatore?.indirizzo}/>
        {ddt.riparatore?.piva&&<IOSRow icon="🪪" label="P.IVA" value={ddt.riparatore.piva}/>}
        <IOSRow icon="📅" label="Data invio" value={fmtDate(ddt.data)}/>
        {ddt.dataRientro&&<IOSRow icon="📅" label="Data rientro" value={fmtDate(ddt.dataRientro)}/>}
        <IOSRow icon="📦" label="Oggetti" value={items.length+" pz."} last/>
      </IOSCard>
      {ddt.riparatore?.trasporto&&(()=>{const t=ddt.riparatore.trasporto;return(
        <IOSCard style={{marginBottom:12}}>
          {t.causale&&<IOSRow icon="📋" label="Causale" value={t.causale}/>}
          {t.aspettoBeni&&<IOSRow icon="📦" label="Aspetto beni" value={t.aspettoBeni}/>}
          {t.nColli&&<IOSRow icon="🔢" label="N. colli" value={t.nColli}/>}
          {t.peso&&<IOSRow icon="⚖️" label="Peso lordo" value={t.peso+" kg"}/>}
          {t.vettore&&<IOSRow icon="🚚" label="Vettore" value={t.vettore}/>}
          {t.portoFranco&&<IOSRow icon="💳" label="Porto" value={t.portoFranco}/>}
          {t.dataInizio&&<IOSRow icon="🕐" label="Inizio trasporto" value={fmtDate(t.dataInizio)+(t.oraInizio?" ore "+t.oraInizio:"")} last/>}
        </IOSCard>
      );})()}

      {/* ── Riepilogo economico ── */}
      {hasCosts&&(
        <>
          <SectionTitle>💰 Riepilogo economico</SectionTitle>

          {/* Totali in evidenza */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
            {[
              {l:"Spesa",   v:totSpesa,   bg:"#FFF1F2", col:"#E11D48"},
              {l:"Ricavi",  v:totRicavi,  bg:"#ECFDF5", col:"#059669"},
              {l:"Margine", v:totMargine, bg:totMargine>=0?"#EFF6FF":"#FFF1F2", col:totMargine>=0?"#1D4ED8":"#E11D48"},
            ].map(s=>(
              <div key={s.l} style={{background:s.bg,borderRadius:14,padding:"12px 8px",textAlign:"center"}}>
                <div style={{fontSize:15,fontWeight:800,color:s.col}}>{s.v.toFixed(2)} €</div>
                <div style={{fontSize:11,color:s.col,opacity:.7,fontWeight:600,marginTop:3}}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Tabella dettaglio per riparazione */}
          <IOSCard style={{marginBottom:12}}>
            {/* Header tabella */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 60px 60px 60px",gap:6,padding:"8px 14px",borderBottom:"1px solid #F2F2F7"}}>
              {["Riparazione","Spesa","Ricavo","Margine"].map(h=>(
                <div key={h} style={{fontSize:11,fontWeight:700,color:C.secondary,textAlign:h==="Riparazione"?"left":"right"}}>{h}</div>
              ))}
            </div>
            {/* Righe */}
            {items.map((r,i)=>{
              const spesa=parseFloat(r.spesa)||0;
              const ricavo=parseFloat(r.prezzoFinale)||0;
              const margine=ricavo-spesa;
              const hasBoth=spesa>0&&ricavo>0;
              return(
                <div key={r.id} style={{display:"grid",gridTemplateColumns:"1fr 60px 60px 60px",gap:6,padding:"10px 14px",borderBottom:i<items.length-1?"1px solid #F2F2F7":"none",alignItems:"center"}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.label,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.numero}</div>
                    <div style={{fontSize:11,color:C.secondary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.descrizione}</div>
                  </div>
                  <div style={{fontSize:12,fontWeight:600,color:"#E11D48",textAlign:"right"}}>{spesa>0?spesa.toFixed(2):"—"}</div>
                  <div style={{fontSize:12,fontWeight:600,color:"#059669",textAlign:"right"}}>{ricavo>0?ricavo.toFixed(2):"—"}</div>
                  <div style={{fontSize:12,fontWeight:700,color:hasBoth?(margine>=0?"#1D4ED8":"#E11D48"):C.secondary,textAlign:"right"}}>{hasBoth?margine.toFixed(2):"—"}</div>
                </div>
              );
            })}
            {/* Riga totali */}
            {items.length>1&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 60px 60px 60px",gap:6,padding:"10px 14px",background:"#F9F9FB",borderTop:"2px solid #E5E5EA",alignItems:"center"}}>
                <div style={{fontSize:12,fontWeight:800,color:C.label}}>TOTALE</div>
                <div style={{fontSize:12,fontWeight:800,color:"#E11D48",textAlign:"right"}}>{totSpesa.toFixed(2)}</div>
                <div style={{fontSize:12,fontWeight:800,color:"#059669",textAlign:"right"}}>{totRicavi.toFixed(2)}</div>
                <div style={{fontSize:12,fontWeight:800,color:totMargine>=0?"#1D4ED8":"#E11D48",textAlign:"right"}}>{totMargine.toFixed(2)}</div>
              </div>
            )}
          </IOSCard>
        </>
      )}

      <SectionTitle>Oggetti inviati</SectionTitle>
      {items.map(r=>(
        <div key={r.id} style={{background:C.white,borderRadius:14,padding:"12px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",gap:8,marginBottom:4}}>
              <span style={{fontSize:14,fontWeight:700,color:C.label}}>{r.numero}</span>
              <IOSBadge status={r.status}/>
              {r.richiestaPreventivo&&<span style={{fontSize:11,color:C.purple,fontWeight:600}}>⏳ prev.</span>}
            </div>
            <div style={{fontSize:13,color:C.secondary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.descrizione}</div>
            {(r.spesa||r.prezzoFinale)&&(
              <div style={{fontSize:12,marginTop:4,display:"flex",gap:10}}>
                {r.spesa&&<span style={{color:"#E11D48",fontWeight:600}}>↓ {parseFloat(r.spesa).toFixed(2)} €</span>}
                {r.prezzoFinale&&<span style={{color:"#059669",fontWeight:600}}>↑ {parseFloat(r.prezzoFinale).toFixed(2)} €</span>}
              </div>
            )}
          </div>
        </div>
      ))}

      <div style={{height:12}}/>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
        <Btn label="🖨️ Stampa" variant="secondary" full onClick={onPrint}/>
        {ddt.stato!=="rientrato"&&<Btn label="✏️ Modifica" variant="secondary" full onClick={onEdit}/>}
        {ddt.stato!=="rientrato"&&<Btn label="📥 Rientro" variant="green" full onClick={onReturn}/>}
      </div>
      {!confirmDelete
        ?<Btn label="🗑️ Elimina DDT" variant="red" full onClick={()=>setConfirmDelete(true)}/>
        :<div style={{background:"#FFF1F2",borderRadius:14,padding:14,border:"1px solid #FECDD3"}}>
          <div style={{fontSize:14,fontWeight:600,color:C.red,marginBottom:12}}>⚠️ Eliminare questo DDT? Gli oggetti torneranno a "ricevuto".</div>
          <div style={{display:"flex",gap:10}}>
            <Btn label="Annulla" variant="secondary" full onClick={()=>setConfirmDelete(false)}/>
            <Btn label="Elimina" variant="red" full onClick={onDelete}/>
          </div>
        </div>
      }
    </Sheet>
  );
}

/* ── DDT Return ── */
function DDTReturn({ddt,repairs,customers,onSave,onClose}) {
  const items=repairs.filter(r=>ddt.riparazioniIds?.includes(r.id));
  const [costs,setCosts]=useState(()=>Object.fromEntries(items.map(r=>[r.id,{spesa:"",prezzoFinale:"",nuovoStato:"pronto"}])));
  const setF=(id,k,v)=>setCosts(c=>({...c,[id]:{...c[id],[k]:v}}));
  return (
    <Sheet onClose={onClose} title={"Rientro "+ddt.numero}>
      <div style={{fontSize:14,color:C.secondary,marginBottom:16}}>Inserisci la spesa del fornitore e il prezzo finale per ogni oggetto.</div>
      <div style={{display:"flex",flexDirection:"column",gap:12,maxHeight:"55vh",overflowY:"auto",marginBottom:16}}>
        {items.map(r=>{const c=customers.find(x=>x.id===r.customerId);const fi=costs[r.id];return(
          <div key={r.id} style={{background:C.white,borderRadius:18,padding:16,boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
            <div style={{fontSize:14,fontWeight:700,color:C.label,marginBottom:2}}>{r.numero} · {r.categoria}</div>
            <div style={{fontSize:14,color:C.label,marginBottom:2}}>{r.descrizione}</div>
            {r.richiestaPreventivo&&<div style={{fontSize:12,color:C.purple,fontWeight:600,marginBottom:6}}>⏳ Era in attesa di preventivo</div>}
            {c&&<div style={{fontSize:12,color:C.secondary,marginBottom:12}}>👤 {c.cognome} {c.nome}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <IOSInput label="Spesa fornitore (€)" type="number" placeholder="0.00" value={fi?.spesa||""} onChange={e=>setF(r.id,"spesa",e.target.value)}/>
              <IOSInput label="Prezzo finale (€)" type="number" placeholder="0.00" value={fi?.prezzoFinale||""} onChange={e=>setF(r.id,"prezzoFinale",e.target.value)}/>
            </div>
            {fi?.spesa&&fi?.prezzoFinale&&parseFloat(fi.prezzoFinale)>parseFloat(fi.spesa)&&(<div style={{background:"#ECFDF5",borderRadius:12,padding:"8px 12px",marginBottom:10,border:"1px solid #BBF7D0",fontSize:12,color:"#059669"}}>Margine: {(parseFloat(fi.prezzoFinale)-parseFloat(fi.spesa)).toFixed(2)} €</div>)}
            <div style={{fontSize:12,fontWeight:700,color:C.secondary,marginBottom:8}}>Nuovo stato</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{Object.entries(STATUSES).filter(([k])=>k!=="presso_esterno").map(([k,v])=><button key={k} onClick={()=>setF(r.id,"nuovoStato",k)} style={{padding:"6px 12px",borderRadius:16,border:"none",background:fi?.nuovoStato===k?v.bg:"#F2F2F7",color:fi?.nuovoStato===k?v.color:C.secondary,fontSize:12,fontWeight:fi?.nuovoStato===k?700:500,cursor:"pointer"}}>{v.label}</button>)}</div>
          </div>);
        })}
      </div>
      <div style={{display:"flex",gap:10}}><Btn label="Annulla" variant="secondary" full onClick={onClose}/><Btn label="✅ Conferma rientro" variant="green" full onClick={()=>onSave(costs)}/></div>
    </Sheet>
  );
}

/* ── Rientro Rapido ── */
function RientroRapido({repairs,customers,ddts,onSave,onClose}) {
  const available=repairs.filter(r=>r.status==="presso_esterno");
  const [step,setStep]=useState(1);
  const [selected,setSelected]=useState([]);
  const [costs,setCosts]=useState({});
  const [qrMsg,setQrMsg]=useState("");
  const [search,setSearch]=useState("");
  const fileRef=useRef();

  /* Raggruppa per DDT/riparatore */
  const groups=(() => {
    const map={};
    available.forEach(r=>{
      const ddt=ddts.find(d=>d.riparazioniIds?.includes(r.id));
      const key=ddt?.id||"__none__";
      const label=ddt?`${ddt.numero} — ${ddt.riparatore?.nome||"—"}`:"Senza DDT";
      if(!map[key])map[key]={label,repairs:[]};
      map[key].repairs.push(r);
    });
    return Object.values(map);
  })();

  const filteredGroups=search.trim()
    ?groups.map(g=>({...g,repairs:g.repairs.filter(r=>{
        const c=customers.find(x=>x.id===r.customerId);
        const q=search.trim().toLowerCase();
        return r.numero.toLowerCase().includes(q)||(c&&(c.cognome+" "+c.nome).toLowerCase().includes(q));
      })})).filter(g=>g.repairs.length>0)
    :groups;

  const toggle=(id)=>{
    const wasSelected=selected.includes(id);
    setSelected(s=>wasSelected?s.filter(x=>x!==id):[...s,id]);
    if(!wasSelected&&!costs[id]) setCosts(c=>({...c,[id]:{spesa:"",prezzoFinale:"",nuovoStato:"pronto"}}));
  };

  const selectGroup=(ids)=>{
    const newIds=ids.filter(id=>!selected.includes(id));
    setSelected(s=>[...s,...newIds]);
    const nc={};
    newIds.forEach(id=>{if(!costs[id])nc[id]={spesa:"",prezzoFinale:"",nuovoStato:"pronto"};});
    setCosts(c=>({...c,...nc}));
  };

  const setF=(id,k,v)=>setCosts(c=>({...c,[id]:{...c[id],[k]:v}}));

  /* Decodifica QR da immagine */
  const handleFileQR=async(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    e.target.value="";
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=async()=>{
      const canvas=document.createElement("canvas");
      canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
      canvas.getContext("2d").drawImage(img,0,0);
      URL.revokeObjectURL(url);
      let numero=null;
      if("BarcodeDetector" in window){
        try{const det=new window.BarcodeDetector({formats:["qr_code","code_128","code_39"]});const codes=await det.detect(canvas);for(const c of codes){const m=(c.rawValue||"").toUpperCase().match(/R\d{4}-\d{4}/);if(m){numero=m[0];break;}}}catch(e){}
      }
      if(!numero){
        for(const scale of [1,0.5,0.25]){
          const w=Math.floor(canvas.width*scale);const h=Math.floor(canvas.height*scale);
          const sc=document.createElement("canvas");sc.width=w;sc.height=h;sc.getContext("2d").drawImage(canvas,0,0,w,h);
          const id=sc.getContext("2d").getImageData(0,0,w,h);
          const code=jsQR(id.data,w,h,{inversionAttempts:"attemptBoth"});
          if(code){const m=code.data.toUpperCase().match(/R\d{4}-\d{4}/);if(m){numero=m[0];break;}}
        }
      }
      if(numero){
        const rep=available.find(r=>r.numero===numero);
        if(!rep){setQrMsg("⚠️ Riparazione non trovata o già rientrata");}
        else if(selected.includes(rep.id)){setQrMsg(`ℹ️ ${rep.numero} già selezionato`);}
        else{toggle(rep.id);setQrMsg(`✅ ${rep.numero} aggiunto`);}
      }else{setQrMsg("⚠️ QR non riconosciuto — riprova");}
      setTimeout(()=>setQrMsg(""),3000);
    };
    img.onerror=()=>setQrMsg("⚠️ Errore lettura immagine");
    img.src=url;
  };

  return (
    <FullScreen onClose={onClose} title={step===1?"📥 Seleziona rientri":"💰 Costi e stato"} step={step} totalSteps={2}>

      {/* ── STEP 1: Selezione ── */}
      {step===1&&<div>
        <div style={{fontSize:15,color:C.secondary,marginBottom:16}}>Seleziona le riparazioni rientrate dal fornitore. Puoi scansionare il QR o spuntarle dalla lista.</div>

        {/* Scan QR */}
        <div style={{background:"#F5F3FF",borderRadius:16,padding:14,marginBottom:16,border:"1px solid #DDD6FE"}}>
          <button onClick={()=>fileRef.current.click()} style={{width:"100%",background:C.purple,border:"none",borderRadius:12,padding:"12px 16px",color:"white",fontSize:15,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
            <span style={{fontSize:22}}>📷</span> Scansiona QR etichetta
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFileQR}/>
          {qrMsg&&<div style={{fontSize:13,fontWeight:600,color:qrMsg.startsWith("✅")?"#059669":qrMsg.startsWith("ℹ")?"#1D4ED8":C.red,marginTop:8,textAlign:"center"}}>{qrMsg}</div>}
        </div>

        {/* Ricerca */}
        {available.length>0&&<div style={{marginBottom:16}}>
          <IOSInput label="Cerca per numero o cliente" placeholder="es. R2024-0042 o Rossi" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>}

        {/* Lista riparazioni */}
        {available.length===0
          ?<div style={{textAlign:"center",padding:"40px 20px",color:C.secondary}}><div style={{fontSize:48,marginBottom:12}}>📦</div><div style={{fontSize:16,fontWeight:600}}>Nessuna riparazione presso riparatori</div></div>
          :filteredGroups.length===0
          ?<div style={{textAlign:"center",padding:"40px 20px",color:C.secondary}}><div style={{fontSize:48,marginBottom:12}}>🔍</div><div style={{fontSize:16,fontWeight:600}}>Nessun risultato</div></div>
          :filteredGroups.map(g=>(
            <div key={g.label} style={{marginBottom:18}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:13,fontWeight:700,color:C.purple,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📤 {g.label}</div>
                <button onClick={()=>selectGroup(g.repairs.map(r=>r.id))} style={{fontSize:12,color:C.purple,background:"#F5F3FF",border:"none",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontWeight:600,flexShrink:0,marginLeft:8}}>Tutti</button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {g.repairs.map(r=>{
                  const c=customers.find(x=>x.id===r.customerId);const sel=selected.includes(r.id);
                  return(
                    <button key={r.id} onClick={()=>toggle(r.id)} style={{background:sel?"#F5F3FF":C.white,border:sel?"2px solid "+C.purple:"2px solid transparent",borderRadius:16,padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",width:"100%",boxShadow:sel?"none":"0 1px 3px rgba(0,0,0,.07)"}}>
                      <div style={{width:28,height:28,borderRadius:14,border:"2px solid "+(sel?C.purple:"#C7C7CC"),background:sel?C.purple:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        {sel&&<span style={{color:"white",fontSize:14,fontWeight:700}}>✓</span>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",gap:8,marginBottom:3,alignItems:"center"}}>
                          <span style={{fontSize:14,fontWeight:700,color:C.label}}>{r.numero}</span>
                          {r.richiestaPreventivo&&<span style={{fontSize:11,color:C.purple,fontWeight:600}}>⏳ prev.</span>}
                        </div>
                        <div style={{fontSize:13,color:C.secondary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.descrizione}{c?" · "+c.cognome:""}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        }

        {selected.length>0&&(
          <div style={{position:"sticky",bottom:0,background:C.surface,paddingTop:12,paddingBottom:4}}>
            <Btn label={`Avanti → (${selected.length} selezionat${selected.length===1?"a":"e"})`} full onClick={()=>setStep(2)}/>
          </div>
        )}
      </div>}

      {/* ── STEP 2: Costi ── */}
      {step===2&&<div>
        <div style={{fontSize:14,color:C.secondary,marginBottom:16}}>Inserisci spesa del fornitore e prezzo finale per il cliente.</div>
        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
          {selected.map(id=>{
            const r=repairs.find(x=>x.id===id);if(!r)return null;
            const c=customers.find(x=>x.id===r.customerId);
            const fi=costs[id]||{spesa:"",prezzoFinale:"",nuovoStato:"pronto"};
            const ddt=ddts.find(d=>d.riparazioniIds?.includes(id));
            return(
              <div key={id} style={{background:C.white,borderRadius:18,padding:16,boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.label}}>{r.numero} · {r.categoria}</div>
                  {ddt&&<span style={{fontSize:11,background:"#F5F3FF",color:C.purple,padding:"2px 8px",borderRadius:10,fontWeight:600,flexShrink:0,marginLeft:8}}>{ddt.numero}</span>}
                </div>
                <div style={{fontSize:13,color:C.label,marginBottom:2}}>{r.descrizione}</div>
                {r.richiestaPreventivo&&<div style={{fontSize:12,color:C.purple,fontWeight:600,marginBottom:6}}>⏳ Era in attesa di preventivo</div>}
                {c&&<div style={{fontSize:12,color:C.secondary,marginBottom:12}}>👤 {c.cognome} {c.nome}</div>}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <IOSInput label="Spesa fornitore (€)" type="number" placeholder="0.00" value={fi.spesa||""} onChange={e=>setF(id,"spesa",e.target.value)}/>
                  <IOSInput label="Prezzo finale (€)" type="number" placeholder="0.00" value={fi.prezzoFinale||""} onChange={e=>setF(id,"prezzoFinale",e.target.value)}/>
                </div>
                {fi.spesa&&fi.prezzoFinale&&parseFloat(fi.prezzoFinale)>parseFloat(fi.spesa)&&(
                  <div style={{background:"#ECFDF5",borderRadius:12,padding:"8px 12px",marginBottom:10,border:"1px solid #BBF7D0",fontSize:12,color:"#059669"}}>Margine: {(parseFloat(fi.prezzoFinale)-parseFloat(fi.spesa)).toFixed(2)} €</div>
                )}
                <div style={{fontSize:12,fontWeight:700,color:C.secondary,marginBottom:8}}>Nuovo stato</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {Object.entries(STATUSES).filter(([k])=>k!=="presso_esterno").map(([k,v])=>(
                    <button key={k} onClick={()=>setF(id,"nuovoStato",k)} style={{padding:"6px 12px",borderRadius:16,border:"none",background:fi.nuovoStato===k?v.bg:"#F2F2F7",color:fi.nuovoStato===k?v.color:C.secondary,fontSize:12,fontWeight:fi.nuovoStato===k?700:500,cursor:"pointer"}}>{v.label}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:10}}>
          <Btn label="← Indietro" variant="secondary" full onClick={()=>setStep(1)}/>
          <Btn label="✅ Conferma rientri" variant="green" full onClick={()=>onSave(selected,costs)}/>
        </div>
      </div>}
    </FullScreen>
  );
}

/* ── Repairer Edit Form (fuori da RepairerManager per evitare remount ad ogni tasto) ── */
function RepairerEditForm({form,rId,isNew,confirmDel,setF,cancelEdit,onSave,onDelete,setConfirmDel}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <IOSInput placeholder="Nome *" value={form?.nome||""} onChange={e=>setF("nome",e.target.value)}/>
      <IOSInput placeholder="Indirizzo" value={form?.indirizzo||""} onChange={e=>setF("indirizzo",e.target.value)}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 2fr 1fr",gap:10}}>
        <IOSInput placeholder="CAP" value={form?.cap||""} onChange={e=>setF("cap",e.target.value)}/>
        <IOSInput placeholder="Città" value={form?.citta||""} onChange={e=>setF("citta",e.target.value)}/>
        <IOSInput placeholder="Prov." value={form?.provincia||""} onChange={e=>setF("provincia",e.target.value.toUpperCase().slice(0,2))}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <IOSInput placeholder="P.IVA" value={form?.piva||""} onChange={e=>setF("piva",e.target.value)}/>
        <IOSInput placeholder="Telefono" value={form?.telefono||""} onChange={e=>setF("telefono",e.target.value)}/>
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn label="Annulla" variant="secondary" full onClick={cancelEdit}/>
        <Btn label="💾 Salva" full disabled={!form?.nome} onClick={()=>{onSave(form);cancelEdit();}}/>
      </div>
      {!isNew&&(confirmDel===rId
        ?<div style={{background:"#FFF1F2",borderRadius:12,padding:12,border:"1px solid #FECDD3"}}><div style={{fontSize:13,color:C.red,fontWeight:600,marginBottom:8}}>⚠️ Eliminare questo riparatore?</div><div style={{display:"flex",gap:8}}><Btn label="No" variant="secondary" full onClick={()=>setConfirmDel(null)}/><Btn label="Elimina" variant="red" full onClick={()=>{onDelete(rId);cancelEdit();}}/></div></div>
        :<Btn label="🗑️ Elimina" variant="red" full onClick={()=>setConfirmDel(rId)}/>
      )}
    </div>
  );
}

/* ── Repairer Manager ── */
function RepairerManager({repairers,onSave,onDelete}) {
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState(null);
  const [confirmDel,setConfirmDel]=useState(null);
  const startEdit=(r)=>{setEditId(r.id);setForm({...r});};
  const startNew=()=>{const id=uid();setEditId(id);setForm({id,nome:"",indirizzo:"",citta:"",provincia:"",cap:"",piva:"",telefono:""});};
  const cancelEdit=()=>{setEditId(null);setForm(null);setConfirmDel(null);};
  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));
  const isNew=editId&&!repairers.find(r=>r.id===editId);
  const formProps={form,setF,cancelEdit,onSave,onDelete,confirmDel,setConfirmDel,isNew};

  return(
    <div>
      {repairers.map(r=>(
        editId===r.id
          ?<div key={r.id} style={{background:C.white,borderRadius:16,padding:16,marginBottom:10,boxShadow:"0 1px 3px rgba(0,0,0,.08)",border:"2px solid #C9A227"}}><div style={{fontSize:14,fontWeight:700,color:C.label,marginBottom:12}}>✏️ {r.nome}</div><RepairerEditForm {...formProps} rId={r.id}/></div>
          :<div key={r.id} style={{background:C.white,borderRadius:16,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:700,color:C.label}}>{r.nome}</div>
              {r.indirizzo&&<div style={{fontSize:12,color:C.secondary}}>{r.indirizzo}</div>}
              {(r.cap||r.citta||r.provincia)&&<div style={{fontSize:12,color:C.secondary}}>{[r.cap,r.citta,r.provincia?`(${r.provincia})`:null].filter(Boolean).join(" ")}</div>}
              <div style={{fontSize:12,color:C.secondary,display:"flex",gap:10,flexWrap:"wrap",marginTop:1}}>
                {r.piva&&<span>P.IVA {r.piva}</span>}
                {r.telefono&&<span>📞 {r.telefono}</span>}
              </div>
            </div>
            <button onClick={()=>startEdit(r)} style={{background:"#FDF6DC",border:"none",borderRadius:10,padding:"8px 12px",color:"#B8860B",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>✏️</button>
          </div>
      ))}
      {isNew&&<div style={{background:C.white,borderRadius:16,padding:16,marginBottom:10,boxShadow:"0 1px 3px rgba(0,0,0,.08)",border:"2px dashed #C9A227"}}><div style={{fontSize:14,fontWeight:700,color:"#B8860B",marginBottom:12}}>➕ Nuovo riparatore</div><RepairerEditForm {...formProps} rId={editId}/></div>}
      {!editId&&<button onClick={startNew} style={{width:"100%",border:"2px dashed #C9A227",borderRadius:16,padding:14,background:"#FDF6DC",color:"#B8860B",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"-apple-system,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><span style={{fontSize:20}}>➕</span> Aggiungi riparatore</button>}
    </div>
  );
}

/* ── Orders Module ── */

function OrderStatusBadge({stato}) {
  const s=ORDER_STATUSES[stato]||ORDER_STATUSES.ordinato;
  return <span style={{background:s.bg,color:s.color,borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:700}}>{s.label}</span>;
}

function OrderCard({order,customers,onView}) {
  const c=customers.find(x=>x.id===order.customerId);
  const s=ORDER_STATUSES[order.stato]||ORDER_STATUSES.ordinato;
  const totProdotti=order.prodotti.reduce((a,p)=>a+(parseFloat(p.prezzoVendita)||0)*(parseInt(p.quantita)||1),0);
  const earliestDate=order.prodotti.map(p=>p.dataConsegnaPrevista).filter(Boolean).sort()[0]||null;
  const isOverdue=order.stato!=="consegnato"&&order.stato!=="annullato"&&earliestDate&&earliestDate<today();
  const totAcconto=order.prodotti.reduce((a,p)=>a+(parseFloat(p.acconto)||0),0);
  return (
    <div onClick={()=>onView(order)} style={{background:C.white,borderRadius:16,padding:"14px 16px",marginBottom:10,boxShadow:"0 1px 3px rgba(0,0,0,.08)",cursor:"pointer",borderLeft:`4px solid ${s.color}`,opacity:order.stato==="annullato"?.6:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
        <div style={{fontWeight:800,fontSize:15,color:C.label}}>{order.numero}</div>
        <OrderStatusBadge stato={order.stato}/>
      </div>
      {c&&<div style={{fontSize:14,color:C.label,marginBottom:4}}>{c.nome} {c.cognome}</div>}
      {order.prodotti.length>0&&<div style={{fontSize:13,color:C.secondary,marginBottom:4}}>{order.prodotti.length} articol{order.prodotti.length===1?"o":"i"}{totProdotti>0?` · ${totProdotti.toFixed(2)} €`:""}</div>}
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        {order.dataOrdine&&<span style={{fontSize:12,color:C.secondary}}>Ord: {fmtDate(order.dataOrdine)}</span>}
        {earliestDate&&<span style={{fontSize:12,color:isOverdue?"#FF3B30":C.secondary,fontWeight:isOverdue?700:400}}>{isOverdue?"⚠️ ":""}Cons: {fmtDate(earliestDate)}</span>}
        {totAcconto>0&&<span style={{fontSize:12,color:"#059669",fontWeight:600}}>Acc: {totAcconto.toFixed(2)} €</span>}
      </div>
    </div>
  );
}

function OrdersPage({orders,customers,onView,onNew}) {
  const [q,setQ]=useState("");
  const [filterStato,setFilterStato]=useState("tutti");

  const filtered=orders.filter(o=>{
    if(filterStato!=="tutti"&&o.stato!==filterStato)return false;
    if(!q)return true;
    const c=customers.find(x=>x.id===o.customerId);
    const words=q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return words.every(w=>
      o.numero.toLowerCase().includes(w)||
      (c&&(c.nome||"").toLowerCase().includes(w))||
      (c&&(c.cognome||"").toLowerCase().includes(w))||
      o.prodotti.some(p=>(p.descrizione||"").toLowerCase().includes(w))
    );
  });

  const inCorso=orders.filter(o=>o.stato==="ordinato"||o.stato==="in_lavorazione").length;
  const arrivati=orders.filter(o=>o.stato==="arrivato").length;

  return (
    <div>
      {/* Stats strip */}
      {orders.length>0&&(
        <div style={{display:"flex",gap:8,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
          {[{l:"In corso",v:inCorso,c:"#3B82F6"},{l:"Arrivati",v:arrivati,c:"#7C3AED"},{l:"Totale",v:orders.length,c:C.secondary}].map(s=>(
            <div key={s.l} style={{background:C.white,borderRadius:12,padding:"10px 14px",minWidth:80,textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,.06)",flexShrink:0}}>
              <div style={{fontSize:22,fontWeight:800,color:s.c}}>{s.v}</div>
              <div style={{fontSize:11,color:C.secondary,marginTop:2}}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{position:"relative",marginBottom:10}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cerca ordine, cliente, articolo…" style={{width:"100%",padding:"10px 36px 10px 12px",borderRadius:12,border:`1px solid ${C.separator}`,fontSize:15,background:C.white,boxSizing:"border-box",outline:"none"}}/>
        {q&&<button onClick={()=>setQ("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",border:"none",background:"none",fontSize:18,color:C.secondary,cursor:"pointer",padding:0}}>×</button>}
      </div>

      {/* Status filter */}
      <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto",paddingBottom:4}}>
        {[{k:"tutti",l:"Tutti"},...Object.entries(ORDER_STATUSES).map(([k,v])=>({k,l:v.label}))].map(({k,l})=>(
          <button key={k} onClick={()=>setFilterStato(k)} style={{flexShrink:0,padding:"6px 14px",borderRadius:20,border:"none",background:filterStato===k?"#1C1C1E":"#E5E5EA",color:filterStato===k?"white":C.label,fontSize:13,fontWeight:filterStato===k?700:400,cursor:"pointer"}}>{l}</button>
        ))}
      </div>

      {/* New order button */}
      <button onClick={onNew} style={{width:"100%",background:"linear-gradient(135deg,#3B82F6,#2563EB)",border:"none",borderRadius:14,padding:"13px",color:"white",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:14,boxShadow:"0 2px 8px rgba(59,130,246,.35)"}}>+ Nuovo Ordine</button>

      {filtered.length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:C.secondary}}>{orders.length===0?"Nessun ordine.":"Nessun risultato."}</div>}
      {filtered.map(o=><OrderCard key={o.id} order={o} customers={customers} onView={onView}/>)}
    </div>
  );
}

function OrderForm({order,customers,onSave,onClose,onAddedCustomer}) {
  const TOTAL=4;
  const isEdit=!!order?.id;
  const [step,setStep]=useState(1);
  const [form,setForm]=useState({
    customerId:order?.customerId||"",
    dataOrdine:order?.dataOrdine||today(),
    stato:order?.stato||"da_ordinare",
    prodotti:order?.prodotti||[],
    note:order?.note||"",
  });
  const [search,setSearch]=useState(()=>{
    if(order?.customerId){const c=customers.find(x=>x.id===order.customerId);return c?`${c.nome} ${c.cognome}`:""}
    return "";
  });
  const [showNew,setShowNew]=useState(false);
  const [newC,setNewC]=useState({nome:"",cognome:"",telefono:"",telefonoPrefisso:"+39",email:"",codiceFiscale:""});
  const emptyProd={descrizione:"",categoria:"",fornitore:"",quantita:1,prezzoAcquisto:"",prezzoVendita:"",note:"",stato:"da_ordinare",acconto:"",dataConsegnaPrevista:"",fotoUrl:null};
  const [prodForm,setProdForm]=useState(emptyProd);
  const [showProd,setShowProd]=useState(!isEdit);
  const [editingProdId,setEditingProdId]=useState(null);
  const [prodFotoPreview,setProdFotoPreview]=useState(null);
  const [saving,setSaving]=useState(false);
  const prodFotoRef=useRef();

  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const selC=customers.find(c=>c.id===form.customerId);
  const filtered=customers.filter(c=>matchCustomer(c,search));
  const totVendita=form.prodotti.reduce((a,p)=>a+(parseFloat(p.prezzoVendita)||0)*(parseInt(p.quantita)||1),0);

  const handleProdFoto=async(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    const blob=await compressImage(file,400,0.5);
    const dataUrl=await blobToDataURL(blob);
    setProdFotoPreview(dataUrl);
  };

  const saveProd=(closeAfter=false)=>{
    if(!prodForm.descrizione.trim())return;
    const parsed={...prodForm,quantita:parseInt(prodForm.quantita)||1,prezzoAcquisto:parseFloat(prodForm.prezzoAcquisto)||null,prezzoVendita:parseFloat(prodForm.prezzoVendita)||null,acconto:parseFloat(prodForm.acconto)||null,dataConsegnaPrevista:prodForm.dataConsegnaPrevista||null,fotoUrl:prodFotoPreview||prodForm.fotoUrl||null};
    if(editingProdId){
      const eid=editingProdId;
      setForm(f=>({...f,prodotti:f.prodotti.map(p=>p.id===eid?{...p,...parsed}:p)}));
      setEditingProdId(null);
      setProdFotoPreview(null);
      setShowProd(false);
    } else {
      const newProd={id:uid(),...parsed};
      setForm(f=>({...f,prodotti:[...f.prodotti,newProd]}));
      setProdForm(emptyProd);
      setProdFotoPreview(null);
      if(closeAfter) setShowProd(false);
    }
  };
  const startEditProd=(p)=>{
    setProdForm({descrizione:p.descrizione||"",categoria:p.categoria||"",fornitore:p.fornitore||"",quantita:p.quantita||1,prezzoAcquisto:p.prezzoAcquisto||"",prezzoVendita:p.prezzoVendita||"",note:p.note||"",stato:p.stato||"da_ordinare",acconto:p.acconto||"",dataConsegnaPrevista:p.dataConsegnaPrevista||"",fotoUrl:p.fotoUrl||null});
    setProdFotoPreview(p.fotoUrl||null);
    setEditingProdId(p.id);
    setShowProd(true);
  };
  const cancelProd=()=>{setProdForm(emptyProd);setEditingProdId(null);setShowProd(false);setProdFotoPreview(null);};
  const removeProd=id=>setForm(f=>({...f,prodotti:f.prodotti.filter(p=>p.id!==id)}));

  const handleSave=async()=>{
    if(saving)return;
    setSaving(true);
    await onSave({...order,...form,id:order?.id||uid()});
    setSaving(false);
  };

  const stepTitles=["","👤 Cliente","🛒 Articoli","📅 Date e pagamento","✅ Riepilogo"];

  return (
    <FullScreen onClose={onClose} title={stepTitles[step]} step={step} totalSteps={TOTAL}>

      {/* STEP 1 — Cliente */}
      {step===1&&<div>
        <div style={{fontSize:24,fontWeight:800,color:C.label,marginBottom:6}}>Chi è il cliente?</div>
        <div style={{fontSize:15,color:C.secondary,marginBottom:20}}>Cerca tra i clienti o aggiungine uno nuovo</div>
        <IOSInput placeholder="🔍  Cerca per nome o telefono…" value={search} onChange={e=>setSearch(e.target.value)} autoFocus/>
        <div style={{height:12}}/>
        {!showNew&&<button onClick={()=>setShowNew(true)} style={{width:"100%",border:"2px dashed #C9A227",borderRadius:16,padding:14,background:"#FDF6DC",color:"#B8860B",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"-apple-system,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:14}}><span style={{fontSize:22}}>➕</span> Aggiungi nuovo cliente</button>}
        {showNew&&(
          <IOSCard style={{marginBottom:14}}>
            <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
              <div style={{fontSize:16,fontWeight:700,color:C.label}}>Nuovo cliente</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <IOSInput placeholder="Nome *" value={newC.nome} onChange={e=>setNewC(c=>({...c,nome:e.target.value}))}/>
                <IOSInput placeholder="Cognome *" value={newC.cognome} onChange={e=>setNewC(c=>({...c,cognome:e.target.value}))}/>
              </div>
              <div><div style={{fontSize:13,fontWeight:600,color:C.secondary,marginBottom:6}}>Telefono</div><PhoneInput prefisso={newC.telefonoPrefisso} telefono={newC.telefono} onPrefisso={v=>setNewC(c=>({...c,telefonoPrefisso:v}))} onTelefono={v=>setNewC(c=>({...c,telefono:v}))}/></div>
              <IOSInput placeholder="Email" type="email" value={newC.email||""} onChange={e=>setNewC(c=>({...c,email:e.target.value}))}/>
              <IOSInput placeholder="Codice Fiscale" value={newC.codiceFiscale||""} onChange={e=>setNewC(c=>({...c,codiceFiscale:e.target.value.toUpperCase()}))}/>
              <div style={{display:"flex",gap:8}}>
                <Btn label="Annulla" variant="secondary" full onClick={()=>setShowNew(false)}/>
                <Btn label="Aggiungi →" full disabled={!newC.nome||!newC.cognome} onClick={()=>onAddedCustomer({...newC,id:uid()},(id)=>{set("customerId",id);setStep(2);setShowNew(false);})}/>
              </div>
            </div>
          </IOSCard>
        )}
        {filtered.length>0&&<IOSCard>{filtered.slice(0,10).map((c,i,arr)=>(
          <button key={c.id} onClick={()=>{set("customerId",c.id);setStep(2);}} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:form.customerId===c.id?"#EFF6FF":"transparent",borderBottom:i<arr.length-1?"1px solid #F2F2F7":"none",cursor:"pointer",border:"none",textAlign:"left"}}>
            <div style={{width:40,height:40,borderRadius:20,background:form.customerId===c.id?"#3B82F6":"#E5E5EA",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:form.customerId===c.id?"white":"#8E8E93",flexShrink:0}}>{c.nome?.[0]}{c.cognome?.[0]}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:600,color:C.label}}>{c.nome} {c.cognome}</div>
              <div style={{fontSize:13,color:C.secondary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{displayPhone(c)||c.email||"—"}</div>
            </div>
            {form.customerId===c.id&&<span style={{color:"#3B82F6",fontSize:20}}>✓</span>}
          </button>
        ))}</IOSCard>}
        <div style={{height:20}}/>
        <Btn label="Avanti →" disabled={!form.customerId} full onClick={()=>setStep(2)}/>
      </div>}

      {/* STEP 2 — Articoli */}
      {step===2&&<div>
        <div style={{fontSize:24,fontWeight:800,color:C.label,marginBottom:6}}>Articoli ordinati</div>
        <div style={{fontSize:15,color:C.secondary,marginBottom:20}}>{form.prodotti.length===0?"Inserisci il primo articolo":"Articoli aggiunti: "+form.prodotti.length+" · aggiungi altri o vai avanti"}</div>

        {form.prodotti.length>0&&(
          <IOSCard style={{marginBottom:14}}>
            {form.prodotti.map((p,i)=>(
              <div key={p.id||i} style={{padding:"12px 16px",borderBottom:i<form.prodotti.length-1?"1px solid #F2F2F7":"none",opacity:editingProdId&&editingProdId!==p.id?0.4:1}}>
                {p.fotoUrl&&<img src={p.fotoUrl} alt="foto" style={{width:"100%",maxHeight:100,objectFit:"cover",borderRadius:10,marginBottom:8}}/>}
                <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:15,fontWeight:600,color:C.label}}>{p.quantita>1?`${p.quantita}× `:""}{p.descrizione}</div>
                    {(p.categoria||p.fornitore)&&<div style={{fontSize:13,color:C.secondary}}>{[p.categoria,p.fornitore].filter(Boolean).join(" · ")}</div>}
                    {p.prezzoVendita&&<div style={{fontSize:13,color:"#059669",marginTop:2}}>Vendita: {p.prezzoVendita} €</div>}
                    {p.note&&<div style={{fontSize:12,color:C.secondary,fontStyle:"italic",marginTop:2}}>{p.note}</div>}
                    <div style={{display:"flex",gap:10,marginTop:3,flexWrap:"wrap"}}>
                      {p.dataConsegnaPrevista&&<span style={{fontSize:12,color:"#3B82F6",fontWeight:600}}>📅 {fmtDate(p.dataConsegnaPrevista)}</span>}
                      {p.acconto&&<span style={{fontSize:12,color:"#059669",fontWeight:600}}>💰 Acc: {p.acconto} €</span>}
                    </div>
                  </div>
                  <button onClick={()=>startEditProd(p)} style={{background:"#EFF6FF",border:"none",borderRadius:8,padding:"5px 9px",color:"#3B82F6",fontSize:13,cursor:"pointer",flexShrink:0}}>✏️</button>
                  <button onClick={()=>removeProd(p.id)} style={{background:"#FFF1F2",border:"none",borderRadius:8,padding:"5px 9px",color:C.red,fontSize:13,cursor:"pointer",flexShrink:0}}>✕</button>
                </div>
              </div>
            ))}
          </IOSCard>
        )}

        {!showProd&&!editingProdId&&(
          <button onClick={()=>setShowProd(true)} style={{width:"100%",border:"2px dashed #3B82F6",borderRadius:16,padding:14,background:"#EFF6FF",color:"#3B82F6",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"-apple-system,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:14}}>
            <span style={{fontSize:22}}>➕</span> Aggiungi articolo
          </button>
        )}

        {showProd&&(
          <IOSCard style={{marginBottom:14}}>
            <div style={{padding:"16px 16px 0",display:"flex",flexDirection:"column",gap:12}}>
              <div style={{fontSize:16,fontWeight:700,color:C.label}}>{editingProdId?"Modifica articolo":"Nuovo articolo"}</div>
              <IOSInput label="Descrizione *" placeholder="es. Anello oro 18kt misura 14" value={prodForm.descrizione} onChange={e=>setProdForm(f=>({...f,descrizione:e.target.value}))} autoFocus/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <IOSInput label="Categoria" placeholder="es. Anelli" value={prodForm.categoria} onChange={e=>setProdForm(f=>({...f,categoria:e.target.value}))}/>
                <IOSInput label="Fornitore" placeholder="es. Oro Vivo" value={prodForm.fornitore} onChange={e=>setProdForm(f=>({...f,fornitore:e.target.value}))}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <IOSInput label="Qtà" type="number" min="1" value={prodForm.quantita} onChange={e=>setProdForm(f=>({...f,quantita:e.target.value}))}/>
                <IOSInput label="Vend. €" type="number" step="0.01" placeholder="0.00" value={prodForm.prezzoVendita} onChange={e=>setProdForm(f=>({...f,prezzoVendita:e.target.value}))}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <IOSInput label="Consegna prevista" type="date" value={prodForm.dataConsegnaPrevista} onChange={e=>setProdForm(f=>({...f,dataConsegnaPrevista:e.target.value}))}/>
                <IOSInput label="Acconto (€)" type="number" step="0.01" placeholder="0.00" value={prodForm.acconto} onChange={e=>setProdForm(f=>({...f,acconto:e.target.value}))}/>
              </div>
              <IOSInput label="Note articolo" placeholder="Misura, colore, incisione…" value={prodForm.note} onChange={e=>setProdForm(f=>({...f,note:e.target.value}))}/>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:C.secondary,marginBottom:6}}>FOTO ARTICOLO</div>
                <button onClick={()=>prodFotoRef.current.click()} style={{width:"100%",border:"2px dashed #C9A227",borderRadius:12,padding:prodFotoPreview?0:"14px",background:"#FDF6DC",cursor:"pointer",overflow:"hidden",minHeight:56,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {prodFotoPreview?<img src={prodFotoPreview} alt="ref" style={{width:"100%",maxHeight:140,objectFit:"cover",borderRadius:10}}/>:<div style={{textAlign:"center"}}><div style={{fontSize:24}}>📷</div><div style={{fontSize:13,color:"#B8860B",fontWeight:600,marginTop:2}}>Scatta o carica foto</div></div>}
                </button>
                <input ref={prodFotoRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleProdFoto}/>
                {prodFotoPreview&&<button onClick={()=>setProdFotoPreview(null)} style={{marginTop:4,background:"none",border:"none",color:C.red,fontSize:13,cursor:"pointer",padding:0}}>✕ Rimuovi foto</button>}
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:C.secondary,marginBottom:6}}>STATO ARTICOLO</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {Object.entries(ORDER_STATUSES).filter(([k])=>k!=="annullato").map(([k,v])=>(
                    <button key={k} onClick={()=>setProdForm(f=>({...f,stato:k}))} style={{padding:"5px 12px",borderRadius:20,border:`2px solid ${prodForm.stato===k?v.color:"transparent"}`,background:prodForm.stato===k?v.bg:"#E5E5EA",color:prodForm.stato===k?v.color:C.label,fontSize:12,fontWeight:700,cursor:"pointer"}}>{v.label}</button>
                  ))}
                </div>
              </div>
              <div style={{display:"flex",gap:8,paddingBottom:16}}>
                {!editingProdId&&<Btn label="➕ Aggiungi articolo" full disabled={!prodForm.descrizione.trim()} onClick={()=>saveProd(false)}/>}
                <Btn label={editingProdId?"✓ Salva modifiche":"💾 Salva"} full disabled={!prodForm.descrizione.trim()} onClick={()=>saveProd(true)}/>
                {editingProdId&&<Btn label="Annulla" variant="secondary" full onClick={cancelProd}/>}
              </div>
            </div>
          </IOSCard>
        )}

        {form.prodotti.length>0&&totVendita>0&&(
          <IOSCard style={{marginBottom:14}}>
            <div style={{padding:"10px 16px"}}>
              <IOSRow icon="💰" label="Totale vendita" value={`${totVendita.toFixed(2)} €`} last/>
            </div>
          </IOSCard>
        )}

        <div style={{height:8}}/>
        <div style={{display:"flex",gap:10}}>
          <Btn label="← Indietro" variant="secondary" full onClick={()=>setStep(1)}/>
          <Btn label="Avanti →" full onClick={()=>setStep(3)}/>
        </div>
      </div>}

      {/* STEP 3 — Date e pagamento */}
      {step===3&&<div>
        <div style={{fontSize:24,fontWeight:800,color:C.label,marginBottom:6}}>Date e pagamento</div>
        <div style={{fontSize:15,color:C.secondary,marginBottom:20}}>Tutto opzionale — puoi modificare in seguito</div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <IOSInput label="Data ordine" type="date" value={form.dataOrdine} onChange={e=>set("dataOrdine",e.target.value)}/>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:C.secondary,marginBottom:6}}>STATO ORDINE</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {Object.entries(ORDER_STATUSES).map(([k,v])=>(
                <button key={k} onClick={()=>set("stato",k)} style={{background:form.stato===k?v.bg:"white",border:`2px solid ${form.stato===k?v.color:"transparent"}`,borderRadius:14,padding:"12px 16px",textAlign:"left",cursor:"pointer",display:"flex",alignItems:"center",gap:12,boxShadow:form.stato===k?`0 2px 8px ${v.color}33`:"0 1px 3px rgba(0,0,0,.07)"}}>
                  <div style={{width:10,height:10,borderRadius:5,background:v.color,flexShrink:0}}/>
                  <div style={{fontSize:15,fontWeight:form.stato===k?700:500,color:form.stato===k?v.color:C.label}}>{v.label}</div>
                  {form.stato===k&&<span style={{marginLeft:"auto",color:v.color,fontSize:18}}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{height:24}}/>
        <div style={{display:"flex",gap:10}}>
          <Btn label="← Indietro" variant="secondary" full onClick={()=>setStep(2)}/>
          <Btn label="Rivedi riepilogo →" full onClick={()=>setStep(4)}/>
        </div>
      </div>}

      {/* STEP 4 — Riepilogo */}
      {step===4&&<div>
        <div style={{fontSize:24,fontWeight:800,color:C.label,marginBottom:6}}>Tutto pronto!</div>
        <div style={{fontSize:15,color:C.secondary,marginBottom:20}}>Controlla il riepilogo prima di salvare</div>

        <IOSCard style={{marginBottom:12}}>
          <IOSRow icon="👤" label="Cliente" value={selC?`${selC.nome} ${selC.cognome}`:"—"}/>
          <IOSRow icon="📅" label="Data ordine" value={fmtDate(form.dataOrdine)||"—"}/>
          <IOSRow icon="📋" label="Stato" value={ORDER_STATUSES[form.stato]?.label||"—"} last/>
        </IOSCard>

        {form.prodotti.length>0&&(
          <IOSCard style={{marginBottom:12}}>
            <div style={{padding:"10px 16px 6px",fontSize:12,fontWeight:700,color:C.secondary}}>ARTICOLI ({form.prodotti.length})</div>
            {form.prodotti.map((p,i)=>(
              <div key={p.id||i} style={{padding:"10px 16px",borderTop:"1px solid #F2F2F7"}}>
                {p.fotoUrl&&<img src={p.fotoUrl} alt="foto" style={{width:"100%",maxHeight:90,objectFit:"cover",borderRadius:9,marginBottom:6}}/>}
                <div style={{fontSize:14,fontWeight:600,color:C.label}}>{p.quantita>1?`${p.quantita}× `:""}{p.descrizione}</div>
                {[p.categoria,p.fornitore].filter(Boolean).length>0&&<div style={{fontSize:13,color:C.secondary}}>{[p.categoria,p.fornitore].filter(Boolean).join(" · ")}</div>}
                <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:3}}>
                  {p.prezzoVendita&&<span style={{fontSize:12,color:"#059669",fontWeight:600}}>💰 {p.prezzoVendita} €</span>}
                  {p.dataConsegnaPrevista&&<span style={{fontSize:12,color:"#3B82F6",fontWeight:600}}>📅 {fmtDate(p.dataConsegnaPrevista)}</span>}
                  {p.acconto&&<span style={{fontSize:12,color:"#059669",fontWeight:600}}>✅ Acc: {p.acconto} €</span>}
                </div>
              </div>
            ))}
            {totVendita>0&&<div style={{padding:"10px 16px",borderTop:"1px solid #F2F2F7",display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:700}}><span>Totale vendita</span><span>{totVendita.toFixed(2)} €</span></div>}
          </IOSCard>
        )}

        <IOSTextarea label="Note interne" placeholder="Annotazioni per uso interno…" value={form.note} onChange={e=>set("note",e.target.value)}/>

        <div style={{height:24}}/>
        <Btn label={saving?"Salvataggio…":isEdit?"✓ Salva modifiche":"✓ Crea ordine"} full disabled={saving||!form.customerId} onClick={handleSave}/>
        <div style={{height:10}}/>
        <Btn label="← Modifica" variant="secondary" full onClick={()=>setStep(3)}/>
      </div>}

    </FullScreen>
  );
}

function OrderDetail({order,customers,onClose,onEdit,onStatusChange,onDelete,onWhatsApp,onPrint,onProductStatus}) {
  const c=customers.find(x=>x.id===order.customerId);
  const [confirmDel,setConfirmDel]=useState(false);
  const [expandedProd,setExpandedProd]=useState(null);
  const s=ORDER_STATUSES[order.stato]||ORDER_STATUSES.ordinato;
  const totVendita=order.prodotti.reduce((a,p)=>a+(parseFloat(p.prezzoVendita)||0)*(parseInt(p.quantita)||1),0);
  const totAcquisto=order.prodotti.reduce((a,p)=>a+(parseFloat(p.prezzoAcquisto)||0)*(parseInt(p.quantita)||1),0);
  const margine=totVendita-totAcquisto;

  const statusFlow=["da_ordinare","ordinato","arrivato","consegnato"];
  const nextStatus=statusFlow[statusFlow.indexOf(order.stato)+1];
  const nextLabel=nextStatus?ORDER_STATUSES[nextStatus]?.label:null;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:100,display:"flex",alignItems:"flex-end"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:C.surface,borderRadius:"20px 20px 0 0",width:"100%",maxHeight:"92vh",overflowY:"auto",padding:"20px 20px 40px"}}>
        {order.fotoUrl&&<img src={order.fotoUrl} alt="foto ordine" style={{width:"100%",maxHeight:180,objectFit:"cover",borderRadius:14,marginBottom:12}}/>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:22,fontWeight:800,color:C.label}}>{order.numero}</div>
            <OrderStatusBadge stato={order.stato}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={onPrint} style={{background:"#FDF6DC",border:"none",borderRadius:10,padding:"8px 12px",color:"#B8860B",fontSize:14,fontWeight:700,cursor:"pointer"}}>🖨️</button>
            <button onClick={onEdit} style={{background:"#FDF6DC",border:"none",borderRadius:10,padding:"8px 12px",color:"#B8860B",fontSize:14,fontWeight:700,cursor:"pointer"}}>✏️</button>
            <button onClick={onClose} style={{background:"none",border:"none",fontSize:24,cursor:"pointer",color:C.secondary}}>×</button>
          </div>
        </div>

        {/* Cliente */}
        {c&&(
          <div style={{background:C.white,borderRadius:14,padding:14,marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:600,color:C.secondary,marginBottom:4}}>CLIENTE</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:16,fontWeight:700,color:C.label}}>{c.nome} {c.cognome}</div>
                {c.telefono&&<div style={{fontSize:14,color:C.secondary,marginTop:2}}>{displayPhone(c)}</div>}
              </div>
              <WABtn customer={c} size={34}/>
            </div>
          </div>
        )}

        {/* Data ordine */}
        {order.dataOrdine&&(
          <div style={{background:C.white,borderRadius:14,padding:14,marginBottom:12}}>
            <div style={{fontSize:12,color:C.secondary,fontWeight:600,marginBottom:2}}>DATA ORDINE</div>
            <div style={{fontSize:15,fontWeight:700}}>{fmtDate(order.dataOrdine)}</div>
          </div>
        )}

        {/* Prodotti con stato per articolo */}
        {order.prodotti.length>0&&(
          <div style={{background:C.white,borderRadius:14,padding:14,marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:600,color:C.secondary,marginBottom:10}}>ARTICOLI ({order.prodotti.length})</div>
            {order.prodotti.map((p,i)=>{
              const ps=ORDER_STATUSES[p.stato]||ORDER_STATUSES.da_ordinare;
              const isExp=expandedProd===p.id;
              return (
                <div key={p.id||i} style={{paddingBottom:10,marginBottom:10,borderBottom:i<order.prodotti.length-1?`1px solid ${C.separator}`:"none"}}>
                  {p.fotoUrl&&<img src={p.fotoUrl} alt="foto" style={{width:"100%",maxHeight:120,objectFit:"cover",borderRadius:10,marginBottom:8}}/>}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:15,fontWeight:700,color:C.label}}>{p.quantita>1?`${p.quantita}× `:""}{p.descrizione}</div>
                      {(p.categoria||p.fornitore)&&<div style={{fontSize:13,color:C.secondary}}>{[p.categoria,p.fornitore].filter(Boolean).join(" · ")}</div>}
                      {p.note&&<div style={{fontSize:12,color:C.secondary,fontStyle:"italic"}}>{p.note}</div>}
                      <div style={{display:"flex",gap:10,marginTop:3,flexWrap:"wrap"}}>
                        {p.prezzoVendita&&<span style={{fontSize:12,color:"#059669",fontWeight:600}}>Vend: {p.prezzoVendita} €</span>}
                        {p.dataConsegnaPrevista&&<span style={{fontSize:12,color:p.dataConsegnaPrevista<today()&&p.stato!=="consegnato"?"#FF3B30":"#3B82F6",fontWeight:600}}>📅 {fmtDate(p.dataConsegnaPrevista)}</span>}
                        {p.acconto&&<span style={{fontSize:12,color:"#059669",fontWeight:600}}>✅ Acc: {p.acconto} €</span>}
                      </div>
                    </div>
                    <button onClick={()=>setExpandedProd(isExp?null:p.id)} style={{background:ps.bg,border:`1.5px solid ${ps.color}`,borderRadius:20,padding:"4px 10px",color:ps.color,fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>{ps.label} ▾</button>
                  </div>
                  {isExp&&(
                    <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:6}}>
                      {Object.entries(ORDER_STATUSES).map(([k,v])=>(
                        <button key={k} onClick={()=>{onProductStatus(order.id,p.id,k);setExpandedProd(null);}} style={{padding:"5px 12px",borderRadius:20,border:`2px solid ${p.stato===k?v.color:"transparent"}`,background:p.stato===k?v.bg:"#E5E5EA",color:p.stato===k?v.color:C.label,fontSize:12,fontWeight:700,cursor:"pointer"}}>{v.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {totVendita>0&&(
              <div style={{paddingTop:8,borderTop:`1px solid ${C.separator}`}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:700}}><span>Totale vendita</span><span>{totVendita.toFixed(2)} €</span></div>
                {totAcquisto>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:C.secondary,marginTop:2}}><span>Totale acquisto</span><span>{totAcquisto.toFixed(2)} €</span></div>}
                {totAcquisto>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,fontWeight:700,color:margine>=0?"#059669":"#FF3B30",marginTop:2}}><span>Margine</span><span>{margine.toFixed(2)} €</span></div>}
              </div>
            )}
          </div>
        )}

        {/* Note */}
        {order.note&&(
          <div style={{background:C.white,borderRadius:14,padding:14,marginBottom:12}}>
            <div style={{fontSize:14,color:C.label}}>{order.note}</div>
          </div>
        )}

        {/* Avanza stato */}
        {nextLabel&&order.stato!=="annullato"&&(
          <button onClick={()=>onStatusChange(order.id,nextStatus)} style={{width:"100%",background:`linear-gradient(135deg,${s.color},${s.color}CC)`,border:"none",borderRadius:14,padding:"13px",color:"white",fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:10}}>
            → {nextLabel}
          </button>
        )}


        {/* Cambio stato manuale */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:600,color:C.secondary,marginBottom:6}}>CAMBIA STATO</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {Object.entries(ORDER_STATUSES).map(([k,v])=>(
              <button key={k} onClick={()=>onStatusChange(order.id,k)} disabled={order.stato===k} style={{padding:"6px 14px",borderRadius:20,border:`2px solid ${order.stato===k?v.color:"transparent"}`,background:order.stato===k?v.bg:"#E5E5EA",color:order.stato===k?v.color:C.label,fontSize:13,fontWeight:700,cursor:order.stato===k?"default":"pointer",opacity:order.stato===k?1:.7}}>{v.label}</button>
            ))}
          </div>
        </div>

        {/* Elimina */}
        {!confirmDel&&<button onClick={()=>setConfirmDel(true)} style={{width:"100%",background:"none",border:`1px solid ${C.separator}`,borderRadius:14,padding:"12px",color:"#FF3B30",fontSize:14,fontWeight:600,cursor:"pointer"}}>Elimina ordine</button>}
        {confirmDel&&(
          <div style={{background:"#FFF5F5",borderRadius:14,padding:14,textAlign:"center"}}>
            <div style={{fontSize:15,fontWeight:700,color:"#FF3B30",marginBottom:12}}>Eliminare l'ordine?</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{onDelete(order.id);onClose();}} style={{flex:1,background:"#FF3B30",border:"none",borderRadius:10,padding:"11px",color:"white",fontWeight:700,fontSize:15,cursor:"pointer"}}>Elimina</button>
              <button onClick={()=>setConfirmDel(false)} style={{flex:1,background:"#E5E5EA",border:"none",borderRadius:10,padding:"11px",fontWeight:700,fontSize:15,cursor:"pointer"}}>Annulla</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Live QR Scanner ── */
function LiveQRScanner({repairs,customers,onUpdateStatus,onClose}) {
  const videoRef=useRef();const canvasRef=useRef();const rafRef=useRef();const streamRef=useRef();const fileRef=useRef();
  const [found,setFound]=useState(null);const [newStatus,setNewStatus]=useState("pronto");
  const [done,setDone]=useState(false);const [scanning,setScanning]=useState(true);
  const [useFileFallback,setUseFileFallback]=useState(!navigator.mediaDevices?.getUserMedia);
  const [filePreview,setFilePreview]=useState(null);const [fileScanning,setFileScanning]=useState(false);
  const [hint,setHint]=useState("");const [error,setError]=useState(null);
  const hasBarcodeDetector="BarcodeDetector" in window;
  const cust=found?customers.find(c=>c.id===found.customerId):null;

  const handleDetected=useCallback((data)=>{
    const num=(data||"").trim().toUpperCase().match(/R\d{4}-\d{4}/)?.[0];
    if(num){const rep=repairs.find(r=>r.numero===num);if(rep){setFound(rep);setNewStatus(rep.status==="presso_esterno"?"pronto":rep.status==="ricevuto"?"lavorazione":"pronto");return true;}}
    return false;
  },[repairs]);

  const decodeImage=useCallback(async(source)=>{
    if(hasBarcodeDetector){try{const detector=new window.BarcodeDetector({formats:["qr_code","code_128","code_39"]});const codes=await detector.detect(source);for(const code of codes){if(handleDetected(code.rawValue))return true;}}catch(e){}}
    const canvas=document.createElement("canvas");canvas.width=source.width||source.naturalWidth||800;canvas.height=source.height||source.naturalHeight||600;canvas.getContext("2d").drawImage(source,0,0,canvas.width,canvas.height);
    for(const scale of [1,0.5,0.25]){const w=Math.floor(canvas.width*scale);const h=Math.floor(canvas.height*scale);const sc=document.createElement("canvas");sc.width=w;sc.height=h;sc.getContext("2d").drawImage(canvas,0,0,w,h);const id=sc.getContext("2d").getImageData(0,0,w,h);const code=jsQR(id.data,w,h,{inversionAttempts:"attemptBoth"});if(code&&handleDetected(code.data))return true;}
    return false;
  },[hasBarcodeDetector,handleDetected]);

  const handleFileQR=useCallback((e)=>{
    const file=e.target.files?.[0];if(!file)return;
    setFileScanning(true);setFound(null);setError(null);setHint("");
    const url=URL.createObjectURL(file);setFilePreview(url);
    const img=new Image();
    img.onload=async()=>{const ok=await decodeImage(img);URL.revokeObjectURL(url);if(!ok){setError("QR non rilevato");setHint("Avvicina di più la fotocamera al QR e assicurati che sia ben illuminato");}setFileScanning(false);};
    img.onerror=()=>{setError("Errore caricamento immagine");setFileScanning(false);};
    img.src=url;
  },[decodeImage]);

  const stopStream=useCallback(()=>{cancelAnimationFrame(rafRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());},[]);

  useEffect(()=>{
    if(useFileFallback)return;
    let active=true;
    navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:1280},height:{ideal:720}}})
      .then(stream=>{
        if(!active){stream.getTracks().forEach(t=>t.stop());return;}
        streamRef.current=stream;
        if(videoRef.current){videoRef.current.srcObject=stream;videoRef.current.play();}
        const scan=()=>{
          if(!active)return;
          const video=videoRef.current;const canvas=canvasRef.current;
          if(video&&canvas&&video.readyState>=2){
            canvas.width=video.videoWidth;canvas.height=video.videoHeight;
            const ctx=canvas.getContext("2d");ctx.drawImage(video,0,0);
            if(hasBarcodeDetector){
              const detector=new window.BarcodeDetector({formats:["qr_code","code_128"]});
              detector.detect(canvas).then(codes=>{for(const code of codes){const num=(code.rawValue||"").trim().toUpperCase().match(/R\d{4}-\d{4}/)?.[0];if(num){const rep=repairs.find(r=>r.numero===num);if(rep){setScanning(false);setFound(rep);setNewStatus(rep.status==="presso_esterno"?"pronto":rep.status==="ricevuto"?"lavorazione":"pronto");cancelAnimationFrame(rafRef.current);return;}}}}).catch(()=>{});
            }else{
              const id=ctx.getImageData(0,0,canvas.width,canvas.height);
              const code=jsQR(id.data,id.width,id.height,{inversionAttempts:"dontInvert"});
              if(code){const num=code.data.trim().toUpperCase().match(/R\d{4}-\d{4}/)?.[0];if(num){const rep=repairs.find(r=>r.numero===num);if(rep){setScanning(false);setFound(rep);setNewStatus(rep.status==="presso_esterno"?"pronto":rep.status==="ricevuto"?"lavorazione":"pronto");cancelAnimationFrame(rafRef.current);return;}}}
            }
          }
          rafRef.current=requestAnimationFrame(scan);
        };
        rafRef.current=requestAnimationFrame(scan);
      })
      .catch(err=>{setError("Fotocamera non disponibile: "+err.message);setScanning(false);setUseFileFallback(true);});
    return()=>{active=false;stopStream();};
  },[repairs,stopStream,useFileFallback,hasBarcodeDetector]);

  const confirm=()=>{if(found){onUpdateStatus(found.id,newStatus);setDone(true);stopStream();}};
  const handleClose=()=>{stopStream();onClose();};
  const reset=()=>{setFound(null);setError(null);setHint("");setFilePreview(null);setScanning(true);};

  const ResultPanel=()=>(
    <div style={{background:C.surface,width:"100%",borderRadius:useFileFallback?"20px":"20px 20px 0 0",padding:"20px 16px 34px"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#059669",marginBottom:10}}>✅ Riparazione identificata!</div>
      <div style={{background:C.white,borderRadius:12,padding:"12px 14px",marginBottom:14}}>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}><span style={{fontSize:15,fontWeight:800}}>{found.numero}</span><IOSBadge status={found.status}/></div>
        <div style={{fontSize:14,color:C.label}}>{found.descrizione} · {found.categoria}</div>
        {cust&&<div style={{fontSize:12,color:C.secondary,marginTop:2}}>👤 {cust.nome} {cust.cognome}</div>}
      </div>
      <div style={{fontSize:12,fontWeight:700,color:C.secondary,marginBottom:8}}>Aggiorna stato a:</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
        {Object.entries(STATUSES).map(([k,v])=><button key={k} onClick={()=>setNewStatus(k)} style={{padding:"7px 14px",borderRadius:16,border:"none",background:newStatus===k?v.bg:"#F2F2F7",color:newStatus===k?v.color:C.secondary,fontSize:13,fontWeight:newStatus===k?700:500,cursor:"pointer"}}>{v.label}</button>)}
      </div>
      <div style={{display:"flex",gap:10}}><Btn label="Riprova" variant="secondary" full onClick={reset}/><Btn label="✓ Aggiorna stato" variant="green" full onClick={confirm}/></div>
    </div>
  );

  if(useFileFallback){
    return(
      <Sheet onClose={handleClose} title="Scansiona QR etichetta">
        {done?(
          <div style={{textAlign:"center",padding:"30px 20px"}}>
            <div style={{fontSize:60,marginBottom:12}}>✅</div>
            <div style={{fontSize:20,fontWeight:800,color:C.label,marginBottom:8}}>{found.numero} aggiornato!</div>
            <IOSBadge status={newStatus}/>
            {cust&&<div style={{fontSize:14,color:C.secondary,marginTop:8}}>👤 {cust.nome} {cust.cognome}</div>}
            <div style={{height:20}}/><Btn label="Chiudi" full onClick={handleClose}/>
          </div>
        ):found?<ResultPanel/>:(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:"#FFF8E1",borderRadius:14,padding:14,border:"1px solid #FFE082",fontSize:13,color:"#F57F17",lineHeight:1.5}}>⚠️ La fotocamera live richiede <b>HTTPS</b>. Usa la modalità foto — funziona ugualmente!</div>
            <button onClick={()=>fileRef.current.click()} style={{width:"100%",border:"3px dashed "+C.purple,borderRadius:20,padding:filePreview?0:"32px 20px",background:filePreview?"transparent":"#F5F3FF",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:10,overflow:"hidden",minHeight:100,justifyContent:"center"}}>
              {filePreview?<img src={filePreview} alt="qr" style={{width:"100%",maxHeight:240,objectFit:"cover",borderRadius:17}}/>:<><span style={{fontSize:52}}>📷</span><div style={{fontSize:16,fontWeight:700,color:C.purple}}>Scatta foto al QR sull'etichetta</div><div style={{fontSize:13,color:C.secondary}}>Avvicina la fotocamera al QR code</div></>}
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFileQR}/>
            {fileScanning&&<div style={{textAlign:"center",padding:16,color:C.purple,fontWeight:600}}>🔍 Decodifica QR in corso…</div>}
            {error&&!found&&(<div style={{background:"#FFF1F2",borderRadius:14,padding:14,border:"1px solid #FECDD3"}}><div style={{fontSize:15,fontWeight:700,color:C.red,marginBottom:hint?4:10}}>😕 {error}</div>{hint&&<div style={{fontSize:13,color:"#666",marginBottom:10,lineHeight:1.5}}>{hint}</div>}<button onClick={reset} style={{background:"white",border:"1px solid #FECDD3",borderRadius:10,padding:"8px 16px",color:C.red,fontSize:13,fontWeight:600,cursor:"pointer"}}>🔄 Riprova</button></div>)}
          </div>
        )}
      </Sheet>
    );
  }

  return(
    <div style={{position:"fixed",inset:0,background:"black",zIndex:200,display:"flex",flexDirection:"column",fontFamily:"-apple-system,sans-serif"}}>
      <div style={{background:"rgba(0,0,0,.7)",backdropFilter:"blur(10px)",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{fontSize:17,fontWeight:700,color:"white"}}>📷 Scansiona QR etichetta</div>
        <button onClick={handleClose} style={{background:"rgba(255,255,255,.2)",border:"none",borderRadius:10,padding:"8px 14px",color:"white",fontSize:14,fontWeight:600,cursor:"pointer"}}>Chiudi</button>
      </div>
      <div style={{flex:1,position:"relative",overflow:"hidden"}}>
        <video ref={videoRef} playsInline muted style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        <canvas ref={canvasRef} style={{display:"none"}}/>
        {scanning&&!error&&<>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
            <div style={{width:220,height:220,position:"relative"}}>
              {[{top:0,left:0,borderTop:"4px solid white",borderLeft:"4px solid white",borderRadius:"12px 0 0 0"},{top:0,right:0,borderTop:"4px solid white",borderRight:"4px solid white",borderRadius:"0 12px 0 0"},{bottom:0,left:0,borderBottom:"4px solid white",borderLeft:"4px solid white",borderRadius:"0 0 0 12px"},{bottom:0,right:0,borderBottom:"4px solid white",borderRight:"4px solid white",borderRadius:"0 0 12px 0"}].map((s,i)=><div key={i} style={{position:"absolute",width:40,height:40,...s}}/>)}
            </div>
          </div>
          <div style={{position:"absolute",bottom:20,left:0,right:0,textAlign:"center"}}>
            <div style={{display:"inline-block",background:"rgba(0,0,0,.6)",color:"white",borderRadius:20,padding:"8px 20px",fontSize:14,fontWeight:500}}>Punta il QR sull'etichetta della busta</div>
          </div>
        </>}
        {found&&!done&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"flex-end"}}><ResultPanel/></div>}
        {done&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{background:C.white,borderRadius:24,padding:32,textAlign:"center",margin:20}}><div style={{fontSize:60,marginBottom:12}}>✅</div><div style={{fontSize:20,fontWeight:800,color:C.label,marginBottom:8}}>{found.numero} aggiornato!</div><IOSBadge status={newStatus}/>{cust&&<div style={{fontSize:14,color:C.secondary,marginTop:8,marginBottom:16}}>👤 {cust.nome} {cust.cognome}</div>}<Btn label="Chiudi" full onClick={handleClose}/></div></div>}
      </div>
    </div>
  );
}

/* ── MainApp ── */
function MainApp() {
  const [tab,setTab]=useState("home");
  const isMD=useW()>=BP;
  const [customers,setCustomers]=useState([]);const [repairs,setRepairs]=useState([]);
  const [ddts,setDdts]=useState([]);const [repairers,setRepairers]=useState([]);
  const [loading,setLoading]=useState(true);const [syncing,setSyncing]=useState(false);
  const [wizard,setWizard]=useState(false);
  const [customerForm,setCustomerForm]=useState(null);
  const [receiptModal,setReceiptModal]=useState(null);
  const [viewRepair,setViewRepair]=useState(null);
  const [viewCustomer,setViewCustomer]=useState(null);
  const [ddtForm,setDdtForm]=useState(false);
  const [editDDT,setEditDDT]=useState(null);
  const [viewDDT,setViewDDT]=useState(null);
  const [ddtReturn,setDdtReturn]=useState(null);
  const [liveQR,setLiveQR]=useState(false);
  const [waToast,setWaToast]=useState(null);
  const [navFilter,setNavFilter]=useState("");
  const [rientroRapido,setRientroRapido]=useState(false);
  const [importContatti,setImportContatti]=useState(false);
  const [showDuplicates,setShowDuplicates]=useState(false);
  const [showConsegna,setShowConsegna]=useState(false);
  const [orders,setOrders]=useState([]);
  const [viewOrder,setViewOrder]=useState(null);
  const [orderForm,setOrderForm]=useState(null);
  const [orderReceipt,setOrderReceipt]=useState(null);

  /* Naviga alle riparazioni con filtro dalla dashboard */
  const navToRepairs=(filter)=>{
    if(filter==="__rientro__"){setRientroRapido(true);return;}
    setNavFilter(filter); setTab("repairs");
  };

  const loadCustomers=async()=>setCustomers(await api.getCustomers());
  const loadRepairs=async()=>setRepairs(await api.getRepairs());
  const loadDDTs=async()=>setDdts(await api.getDDTs());
  const loadRepairers=async()=>setRepairers(await api.getRepairers());
  const loadOrders=async()=>setOrders(await api.getOrders());

  useEffect(()=>{
    const loadAll=async()=>{await Promise.all([loadCustomers(),loadRepairs(),loadDDTs(),loadRepairers(),loadOrders()]);setLoading(false);};
    loadAll();
    const ch=supabase.channel("db-changes")
      .on("postgres_changes",{event:"*",schema:"public",table:"customers"},loadCustomers)
      .on("postgres_changes",{event:"*",schema:"public",table:"repairs"},loadRepairs)
      .on("postgres_changes",{event:"*",schema:"public",table:"ddts"},loadDDTs)
      .on("postgres_changes",{event:"*",schema:"public",table:"repairers"},loadRepairers)
      .on("postgres_changes",{event:"*",schema:"public",table:"orders"},loadOrders)
      .subscribe();
    return()=>supabase.removeChannel(ch);
  },[]);

  useEffect(()=>{
    const onVisible=()=>{
      if(document.visibilityState==="visible"){
        loadCustomers();loadRepairs();loadDDTs();loadRepairers();loadOrders();
      }
    };
    document.addEventListener("visibilitychange",onVisible);
    return()=>document.removeEventListener("visibilitychange",onVisible);
  },[]);

  const withSync=async fn=>{setSyncing(true);try{await fn();}finally{setSyncing(false);}};
  const getDDT=r=>ddts.find(d=>d.riparazioniIds?.includes(r.id));
  const openReceipt=(rep,preloadedCustomer)=>{
    if(!rep)return;
    setViewRepair(null);
    setViewCustomer(null);
    const c=preloadedCustomer||customers.find(x=>x.id===rep.customerId)||{id:"",nome:"—",cognome:"",telefono:"",telefonoPrefisso:"+39",email:""};
    setReceiptModal({repair:rep,customer:c});
  };

  const handleStatus=async(id,status)=>{
    const extra=status==="consegnato"?{dataConsegnata:today()}:status==="presso_esterno"?{dataSpedita:today()}:{};
    const rep=repairs.find(r=>r.id===id);
    if(rep&&Object.keys(extra).length){
      const updated={...rep,status,...extra};
      await withSync(()=>api.upsertRepair(updated));
      if(viewRepair?.id===id)setViewRepair(updated);
    }else{
      await withSync(()=>api.updateRepairStatus(id,status));
      if(viewRepair?.id===id)setViewRepair(prev=>({...prev,status}));
    }
    if(status==="pronto"){const cust=rep?customers.find(c=>c.id===rep.customerId):null;if(rep&&cust&&cust.telefono)setWaToast({repair:rep,customer:cust});}
  };

  const handleTogglePrev=async repair=>{
    const updated={...repair,preventivoAccettato:!repair.preventivoAccettato};
    await withSync(()=>api.upsertRepair(updated));
    if(viewRepair?.id===repair.id)setViewRepair(updated);
    if(!repair.preventivoAccettato){const ddt=getDDT(repair);if(ddt?.riparatore?.telefono){const phone=ddt.riparatore.telefono.replace(/\D/g,"");const msg=`Gentile ${ddt.riparatore.nome},\nil preventivo per la riparazione n° ${repair.numero} è stato accettato dal cliente.\n\nOggetto: ${repair.descrizione}\n${repair.categoria}${repair.tipoLavoro?" · "+repair.tipoLavoro:""}\n${repair.problema?"Lavoro: "+repair.problema:""}\nPreventivo: ${repair.preventivo?repair.preventivo+" €":"da definire"}\n\nPuò procedere con la riparazione.\n\n${SHOP.nome}`;setWaToast({repair,customer:{nome:ddt.riparatore.nome,cognome:"",telefono:phone,telefonoPrefisso:""},customMsg:msg,label:"💬 Avvisa riparatore"});}}
  };

  const handleToggleRichPrev=async repair=>{
    const updated={...repair,richiestaPreventivo:!repair.richiestaPreventivo};
    await withSync(()=>api.upsertRepair(updated));
    if(viewRepair?.id===repair.id)setViewRepair(updated);
  };

  const handleToggleInterna=async repair=>{
    const updated={...repair,riparazioneInterna:!repair.riparazioneInterna,...(!repair.riparazioneInterna?{richiestaPreventivo:false}:{})};
    await withSync(()=>api.upsertRepair(updated));
    if(viewRepair?.id===repair.id)setViewRepair(updated);
  };

  const handleDateChange=async(id,dataConsegna)=>{
    const rep=repairs.find(r=>r.id===id);if(!rep)return;
    const updated={...rep,dataConsegna};
    await withSync(()=>api.upsertRepair(updated));
    if(viewRepair?.id===id)setViewRepair(updated);
  };

  const handlePreventivoChange=async(id,preventivo)=>{
    const rep=repairs.find(r=>r.id===id);if(!rep)return;
    const updated={...rep,preventivo};
    await withSync(()=>api.upsertRepair(updated));
    if(viewRepair?.id===id)setViewRepair(updated);
  };

  const handleAccontoChange=async(id,acconto)=>{
    const rep=repairs.find(r=>r.id===id);if(!rep)return;
    const updated={...rep,acconto};
    await withSync(()=>api.upsertRepair(updated));
    if(viewRepair?.id===id)setViewRepair(updated);
  };

  const handleSpesaChange=async(id,spesa)=>{
    const rep=repairs.find(r=>r.id===id);if(!rep)return;
    const updated={...rep,spesa};
    await withSync(()=>api.upsertRepair(updated));
    if(viewRepair?.id===id)setViewRepair(updated);
  };

  const handlePrezzoFinaleChange=async(id,prezzoFinale)=>{
    const rep=repairs.find(r=>r.id===id);if(!rep)return;
    const updated={...rep,prezzoFinale};
    await withSync(()=>api.upsertRepair(updated));
    if(viewRepair?.id===id)setViewRepair(updated);
  };

  const handleSoftDelete=async id=>{await withSync(()=>api.softDeleteRepair(id));setViewRepair(null);};
  const handleWizardAddCustomer=async(data,cb)=>{await withSync(()=>api.upsertCustomer(data));cb(data.id);};

  /* Rientro rapido: aggiorna riparazioni selezionate e controlla DDT */
  const handleRientroRapido=async(selectedIds,costs)=>{
    await withSync(async()=>{
      for(const id of selectedIds){
        const fi=costs[id];if(!fi)continue;
        const spesa=parseFloat(fi.spesa)||null;const fin=parseFloat(fi.prezzoFinale)||null;
        await api.updateRepairReturn(id,{status:fi.nuovoStato||"pronto",spesa,prezzoFinale:fin,preventivo:fin||repairs.find(r=>r.id===id)?.preventivo,dataRientrata:today()});
        if(fi.nuovoStato==="pronto"){
          const rep=repairs.find(r=>r.id===id);
          const cust=rep?customers.find(c=>c.id===rep.customerId):null;
          if(cust?.telefono)setWaToast({repair:rep,customer:cust});
        }
      }
      /* Auto-marca DDT come rientrato se tutti i suoi oggetti sono tornati */
      const affectedDdtIds=[...new Set(selectedIds.map(id=>ddts.find(d=>d.riparazioniIds?.includes(id))?.id).filter(Boolean))];
      for(const ddtId of affectedDdtIds){
        const ddt=ddts.find(d=>d.id===ddtId);if(!ddt||ddt.stato==="rientrato")continue;
        const allIds=ddt.riparazioniIds||[];
        const allReturned=allIds.every(repId=>selectedIds.includes(repId)||(repairs.find(r=>r.id===repId)?.status!=="presso_esterno"));
        if(allReturned)await api.upsertDDT({...ddt,stato:"rientrato",dataRientro:today()});
      }
    });
    await Promise.all([loadRepairs(),loadDDTs()]);
    setRientroRapido(false);
  };

  const handleSaveRepairer=async data=>{await withSync(()=>api.upsertRepairer(data));};
  const handleDeleteRepairer=async id=>{await withSync(()=>api.deleteRepairer(id));};
  const handleDeleteCustomer=async id=>{await withSync(()=>api.deleteCustomer(id));setViewCustomer(null);};
  const handleBulkDeleteCustomer=async id=>{await api.deleteCustomer(id);};

  const handleConsegna=async(repair,customer)=>{
    const updated={...repair,status:"consegnato",dataConsegnata:today()};
    await withSync(()=>api.upsertRepair(updated));
    if(viewRepair?.id===repair.id)setViewRepair(updated);
    if(customer?.telefono){
      const msg=`Gentile ${customer.nome} ${customer.cognome},\nconfermiamo il ritiro della riparazione n° ${repair.numero}.\n\nOggetto: ${repair.descrizione}${repair.tipoLavoro?"\nLavoro: "+repair.tipoLavoro:""}${repair.prezzoFinale?"\nImporto: "+repair.prezzoFinale+" €":""}\nData ritiro: ${new Date().toLocaleDateString("it-IT",{day:"2-digit",month:"long",year:"numeric"})}\n\nGrazie per aver scelto ${SHOP.nome}.\n${SHOP.indirizzo}, ${SHOP.citta}\nTel. ${SHOP.tel}`;
      setWaToast({repair,customer,customMsg:msg,label:"📄 Invia ricevuta"});
    }
  };

  /* Importazione massiva contatti da vCard */
  const handleImportContatti=async(contacts)=>{
    await withSync(async()=>{
      for(const c of contacts) await api.upsertCustomer(c);
    });
  };

  const handleSaveOrder=async form=>{
    const isNew=!form.id||!orders.find(o=>o.id===form.id);
    const numero=isNew?await api.getNextOrderNum():form.numero;
    const id=form.id;
    const saved={...form,numero};
    await withSync(()=>api.upsertOrder(saved));
    setOrderForm(null);
    if(viewOrder?.id===id)setViewOrder(saved);
    const c=customers.find(x=>x.id===saved.customerId);
    try{smartPrint(orderLabelHTML(saved,c||null));}catch(e){console.error(e);}
    if(isNew){
      if(c?.telefono){
        let msg=`Gentile ${c.nome} ${c.cognome},\nconfermiamo la ricezione del suo ordine n° ${numero}.`;
        if(saved.prodotti?.length>0){
          msg+="\n\n"+saved.prodotti.map(p=>{
            let line=`• ${p.quantita>1?p.quantita+"× ":""}${p.descrizione}`;
            if(p.dataConsegnaPrevista)line+=`\n  Consegna: ${fmtDate(p.dataConsegnaPrevista)}`;
            if(p.acconto)line+=`\n  Acconto: ${p.acconto} €`;
            return line;
          }).join("\n");
        }
        msg+=`\n\nGrazie per la fiducia!\n${SHOP.nome}\n${SHOP.indirizzo}, ${SHOP.citta}\nTel. ${SHOP.tel}`;
        setWaToast({repair:saved,customer:c,customMsg:msg,label:"💬 Invia conferma ordine"});
      }
    }
  };

  const handleOrderProductStatus=async(orderId,prodId,stato)=>{
    const ord=orders.find(o=>o.id===orderId);if(!ord)return;
    const prod=ord.prodotti.find(p=>p.id===prodId);
    const prodotti=ord.prodotti.map(p=>p.id===prodId?{...p,stato}:p);
    const updated={...ord,prodotti};
    await withSync(()=>api.upsertOrder(updated));
    if(viewOrder?.id===orderId)setViewOrder(updated);
    const c=customers.find(x=>x.id===ord.customerId);
    if(c?.telefono&&prod){
      const nomeProd=`${prod.quantita>1?prod.quantita+"× ":""}${prod.descrizione}`;
      if(stato==="arrivato"&&prod.stato==="ordinato"){
        const msg=`Gentile ${c.nome} ${c.cognome},\nle comunichiamo che il suo articolo "${nomeProd}" (ordine n° ${ord.numero}) è arrivato ed è pronto per il ritiro.\n\n${SHOP.nome}\n${SHOP.indirizzo}, ${SHOP.citta}\nTel. ${SHOP.tel}`;
        setWaToast({repair:ord,customer:c,customMsg:msg,label:"💬 Articolo arrivato"});
      } else if(stato==="consegnato"){
        const msg=`Gentile ${c.nome} ${c.cognome},\nconfermiamo la consegna di "${nomeProd}" dell'ordine n° ${ord.numero}.\n\nGrazie per aver scelto ${SHOP.nome}.`;
        setWaToast({repair:ord,customer:c,customMsg:msg,label:"📄 Articolo consegnato"});
      }
    }
  };

  const handleOrderStatus=async(id,stato)=>{
    await withSync(()=>api.updateOrderStatus(id,stato));
    if(viewOrder?.id===id)setViewOrder(prev=>({...prev,stato}));
  };

  const handleDeleteOrder=async id=>{
    await withSync(()=>api.deleteOrder(id));
    setViewOrder(null);
  };

  const handleOrderWhatsApp=(order,customer,tipo)=>{
    let msg="";
    if(tipo==="arrivato"){
      msg=`Gentile ${customer.nome} ${customer.cognome},\nle comunichiamo che il suo ordine n° ${order.numero} è arrivato ed è pronto per il ritiro.\n\n`;
      if(order.prodotti.length>0)msg+=order.prodotti.map(p=>`• ${p.quantita>1?p.quantita+"× ":""}${p.descrizione}`).join("\n")+"\n\n";
      msg+=`${SHOP.nome}\n${SHOP.indirizzo}, ${SHOP.citta}\nTel. ${SHOP.tel}`;
    } else {
      msg=`Gentile ${customer.nome} ${customer.cognome},\nconfermiamo la consegna dell'ordine n° ${order.numero}.\n\nGrazie per aver scelto ${SHOP.nome}.`;
    }
    setWaToast({repair:order,customer,customMsg:msg,label:"💬 Invia messaggio"});
  };

  const handleSaveRepair=async form=>{
    const allItems=[...(form.items||[]),{categoria:form.categoria,tipoLavoro:form.tipoLavoro,descrizione:form.descrizione,materiali:form.materiali,problema:form.problema,mano:form.mano,dito:form.dito}];
    const c=customers.find(x=>x.id===form.customerId);
    const savedRepairs=[];
    setSyncing(true);
    for(let i=0;i<allItems.length;i++){
      const item=allItems[i];
      const numero=await api.getNextRepairNum();
      const id=uid();
      const n={id,numero,customerId:form.customerId,categoria:item.categoria,tipoLavoro:item.tipoLavoro,descrizione:item.descrizione,materiali:item.materiali,problema:item.problema,mano:item.mano,dito:item.dito,preventivo:form.preventivo,preventivoAccettato:form.preventivoAccettato,richiestaPreventivo:form.richiestaPreventivo,dataConsegna:form.dataConsegna,note:form.note,status:"ricevuto",dataRicevuta:today(),items:null,operatore:form.operatore||null};
      if(i===0&&form.fotoBlob){const url=await uploadPhoto(form.fotoBlob,n.id);if(url)n.fotoUrl=url;}
      await api.upsertRepair(n);
      savedRepairs.push(n);
    }
    setSyncing(false);
    setWizard(false);
    if(c&&savedRepairs.length>0){
      if(savedRepairs.length===1){
        /* Singolo oggetto → apre il modal etichette normalmente */
        setReceiptModal({repair:savedRepairs[0],customer:c});
      } else {
        /* Multi-oggetto → apre il modal etichette per il primo oggetto */
        setReceiptModal({repair:savedRepairs[0],customer:c});
      }
    }
  };

  const handleSaveCustomer=async data=>{await withSync(()=>api.upsertCustomer(data.id?data:{...data,id:uid()}));setCustomerForm(null);};

  const handleDDT=async({rip,selIds,note,selRipId})=>{
    if(!selRipId&&rip.nome)await api.upsertRepairer({...rip,id:uid()});
    const nd={id:uid(),numero:ddtNum(ddts.length+1),data:today(),riparatore:rip,riparazioniIds:selIds,stato:"inviato",note};
    await withSync(async()=>{await api.upsertDDT(nd);await Promise.all(selIds.map(id=>{const rep=repairs.find(r=>r.id===id);return rep?api.upsertRepair({...rep,status:"presso_esterno",dataSpedita:today()}):api.updateRepairStatus(id,"presso_esterno");}));});
    setDdtForm(false);
    const updRep=repairs.map(r=>selIds.includes(r.id)?{...r,status:"presso_esterno"}:r);
    printHTML(ddtHTML(nd,updRep.filter(r=>selIds.includes(r.id))));
  };

  const handleEditDDT=async({rip,selIds,note})=>{
    const oldIds=editDDT.riparazioniIds||[];
    const addedIds=selIds.filter(id=>!oldIds.includes(id));
    const removedIds=oldIds.filter(id=>!selIds.includes(id));
    const updated={...editDDT,riparatore:rip,riparazioniIds:selIds,note};
    await withSync(async()=>{
      await api.upsertDDT(updated);
      await Promise.all(addedIds.map(id=>{const rep=repairs.find(r=>r.id===id);return rep?api.upsertRepair({...rep,status:"presso_esterno",dataSpedita:today()}):api.updateRepairStatus(id,"presso_esterno");}));
      await Promise.all(removedIds.map(id=>api.updateRepairStatus(id,"ricevuto")));
    });
    setEditDDT(null);
    setViewDDT(updated);
    const updRep=repairs.map(r=>addedIds.includes(r.id)?{...r,status:"presso_esterno"}:removedIds.includes(r.id)?{...r,status:"ricevuto"}:r);
    printHTML(ddtHTML(updated,updRep.filter(r=>selIds.includes(r.id))));
  };
  const handleDeleteDDT=async()=>{const ddt=viewDDT;await withSync(async()=>{await api.deleteDDT(ddt.id);for(const id of ddt.riparazioniIds||[])await api.updateRepairStatus(id,"ricevuto");});setViewDDT(null);};

  const handleReturn=async costs=>{
    const ddt=ddtReturn;
    await withSync(async()=>{
      for(const r of repairs.filter(r=>ddt.riparazioniIds?.includes(r.id))){
        const fi=costs[r.id];if(!fi)continue;
        const spesa=parseFloat(fi.spesa)||null;const fin=parseFloat(fi.prezzoFinale)||null;
        await api.updateRepairReturn(r.id,{status:fi.nuovoStato||"pronto",spesa,prezzoFinale:fin,preventivo:fin||r.preventivo,dataRientrata:today()});
        if(fi.nuovoStato==="pronto"){const cust=customers.find(c=>c.id===r.customerId);if(cust?.telefono)setWaToast({repair:r,customer:cust});}
      }
      await api.upsertDDT({...ddt,stato:"rientrato",dataRientro:today()});
    });
    await Promise.all([loadRepairs(),loadDDTs()]);
    setDdtReturn(null);setViewDDT(null);
  };

  const handleRestore=async bk=>{
    await withSync(async()=>{
      for(const c of bk.customers||[])await api.upsertCustomer(c);
      for(const r of bk.repairs||[])await api.upsertRepair(r);
      for(const d of bk.ddts||[])await api.upsertDDT(d);
      for(const r of bk.repairers||[])await api.upsertRepairer(r);
    });
  };

  if(loading)return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.surface,flexDirection:"column",gap:12,fontFamily:"-apple-system,sans-serif"}}><div style={{fontSize:56}}>💍</div><div style={{color:C.secondary,fontSize:16}}>Caricamento…</div></div>;

  const TABS=[{id:"home",icon:"🏠",l:"Home"},{id:"repairs",icon:"🔧",l:"Riparazioni"},{id:"customers",icon:"👥",l:"Clienti"},{id:"orders",icon:"🛒",l:"Ordini"},{id:"ddt",icon:"📦",l:"DDT"},{id:"settings",icon:"⚙️",l:"Altro"}];
  const pageTitle={home:"Repair Manager",repairs:"Riparazioni",customers:"Clienti",orders:"Ordini",ddt:"DDT Riparatori",settings:"Impostazioni"}[tab];

  const MODALS=(
    <>
      {orderForm!==null&&<OrderForm order={orderForm.id?orderForm:null} customers={customers} onSave={handleSaveOrder} onClose={()=>setOrderForm(null)} onAddedCustomer={handleWizardAddCustomer}/>}
      {viewOrder&&<OrderDetail order={viewOrder} customers={customers} onClose={()=>setViewOrder(null)} onEdit={()=>{setOrderForm(viewOrder);setViewOrder(null);}} onStatusChange={handleOrderStatus} onDelete={handleDeleteOrder} onWhatsApp={handleOrderWhatsApp} onPrint={()=>setOrderReceipt({order:viewOrder,customer:customers.find(c=>c.id===viewOrder.customerId)||null})} onProductStatus={handleOrderProductStatus}/>}
      {orderReceipt&&<OrderReceiptModal order={orderReceipt.order} customer={orderReceipt.customer} onClose={()=>setOrderReceipt(null)}/>}
      {importContatti&&<ImportContatti customers={customers} onImport={handleImportContatti} onClose={()=>setImportContatti(false)}/>}
      {showDuplicates&&<DuplicatesModal customers={customers} repairs={repairs} onDelete={handleBulkDeleteCustomer} onClose={()=>{setShowDuplicates(false);loadCustomers();}}/>}
      {showConsegna&&<ConsegnaModal repairs={repairs} customers={customers} onConsegna={handleConsegna} onClose={()=>setShowConsegna(false)}/>}
      {rientroRapido&&<RientroRapido repairs={repairs} customers={customers} ddts={ddts} onSave={handleRientroRapido} onClose={()=>setRientroRapido(false)}/>}
      {waToast&&<WAToast repair={waToast.repair} customer={waToast.customer} customMsg={waToast.customMsg} label={waToast.label} onDismiss={()=>setWaToast(null)} isMD={isMD}/>}
      {liveQR&&<LiveQRScanner repairs={repairs} customers={customers} onUpdateStatus={handleStatus} onClose={()=>setLiveQR(false)}/>}
      {wizard&&<RepairWizard customers={customers} onSave={handleSaveRepair} onClose={()=>setWizard(false)} onAddedCustomer={handleWizardAddCustomer}/>}
      {customerForm!==null&&<CustomerForm customer={customerForm.id?customerForm:null} onSave={handleSaveCustomer} onClose={()=>setCustomerForm(null)}/>}
      {receiptModal&&<ReceiptModal repair={receiptModal.repair} customer={receiptModal.customer} onClose={()=>setReceiptModal(null)}/>}
      {viewRepair&&<RepairDetail repair={viewRepair} customer={customers.find(c=>c.id===viewRepair.customerId)} ddt={getDDT(viewRepair)} onClose={()=>setViewRepair(null)} onReceipt={openReceipt} onStatusChange={handleStatus} onTogglePrev={handleTogglePrev} onToggleRichPrev={handleToggleRichPrev} onDelete={()=>handleSoftDelete(viewRepair.id)} onDateChange={handleDateChange} onConsegna={handleConsegna} onPreventivoChange={handlePreventivoChange} onAccontoChange={handleAccontoChange} onToggleInterna={handleToggleInterna} onSpesaChange={handleSpesaChange} onPrezzoFinaleChange={handlePrezzoFinaleChange}/>}
      {viewCustomer&&<CustomerDetail customer={viewCustomer} repairs={repairs.filter(r=>r.customerId===viewCustomer.id)} onClose={()=>setViewCustomer(null)} onEdit={c=>{setViewCustomer(null);setCustomerForm(c);}} onOpenRepair={r=>{setViewCustomer(null);setViewRepair(r);}} onReceipt={openReceipt} onDelete={handleDeleteCustomer}/>}
      {ddtForm&&<DDTForm repairs={repairs} customers={customers} repairers={repairers} onSave={handleDDT} onClose={()=>setDdtForm(false)}/>}
      {editDDT&&<DDTForm repairs={repairs} customers={customers} repairers={repairers} existing={editDDT} onSave={handleEditDDT} onClose={()=>setEditDDT(null)}/>}
      {viewDDT&&<DDTDetail ddt={viewDDT} repairs={repairs} customers={customers} onClose={()=>setViewDDT(null)} onReturn={()=>{setDdtReturn(viewDDT);setViewDDT(null);}} onPrint={()=>printHTML(ddtHTML(viewDDT,repairs.filter(r=>viewDDT.riparazioniIds?.includes(r.id))))} onEdit={()=>{setEditDDT(viewDDT);setViewDDT(null);}} onDelete={handleDeleteDDT}/>}
      {ddtReturn&&<DDTReturn ddt={ddtReturn} repairs={repairs} customers={customers} onSave={handleReturn} onClose={()=>setDdtReturn(null)}/>}
    </>
  );

  const PAGES=(
    <>
      {tab==="home"&&<Dashboard repairs={repairs} customers={customers} ddts={ddts} onView={setViewRepair} onReceipt={openReceipt} onNew={()=>setWizard(true)} onScan={()=>setLiveQR(true)} onNav={navToRepairs} onConsegna={()=>setShowConsegna(true)}/>}
      {tab==="repairs"&&<RepairsPage repairs={repairs} customers={customers} ddts={ddts} onView={setViewRepair} onReceipt={openReceipt} onNew={()=>setWizard(true)} onScan={()=>setLiveQR(true)} navFilter={navFilter} onClearNavFilter={()=>setNavFilter("")} onRientro={()=>setRientroRapido(true)}/>}
      {tab==="customers"&&<CustomersPage customers={customers} repairs={repairs} onView={setViewCustomer} onNew={()=>setCustomerForm({})} onImport={()=>setImportContatti(true)} onDuplicates={()=>setShowDuplicates(true)}/>}
      {tab==="orders"&&<OrdersPage orders={orders} customers={customers} onView={setViewOrder} onNew={()=>setOrderForm({})}/>}
      {tab==="ddt"&&<DDTPage ddts={ddts} repairs={repairs} customers={customers} onView={setViewDDT} onNew={()=>setDdtForm(true)}/>}
      {tab==="settings"&&<SettingsPage customers={customers} repairs={repairs} ddts={ddts} repairers={repairers} onRestore={handleRestore} onSaveRepairer={handleSaveRepairer} onDeleteRepairer={handleDeleteRepairer}/>}
    </>
  );

  /* ── Layout MD+ (sidebar) ── */
  if(isMD) return (
    <div style={{display:"flex",height:"100vh",overflow:"hidden",background:C.surface,fontFamily:"-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"}}>
      {/* Sidebar */}
      <div style={{width:220,background:"rgba(242,242,247,.98)",borderRight:"1px solid rgba(0,0,0,.08)",display:"flex",flexDirection:"column",flexShrink:0,height:"100vh"}}>
        <div style={{padding:"18px 16px 14px",borderBottom:"1px solid rgba(0,0,0,.06)"}}>
          <img src={zerrilloLogo} alt="Zerrillo" style={{height:30,width:"auto",objectFit:"contain",marginBottom:8,display:"block"}}/>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:7,height:7,borderRadius:4,background:syncing?C.orange:C.green,transition:"background .3s",flexShrink:0}}/>
            <div style={{fontSize:11,color:C.secondary}}>{syncing?"Salvataggio…":"Sincronizzato"}</div>
          </div>
        </div>
        <div style={{flex:1,padding:"10px 8px",overflowY:"auto"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:12,border:"none",background:tab===t.id?"rgba(184,134,11,.12)":"transparent",cursor:"pointer",textAlign:"left",marginBottom:2,transition:"background .15s"}}>
              <span style={{fontSize:20,lineHeight:1,flexShrink:0}}>{t.icon}</span>
              <span style={{fontSize:15,fontWeight:tab===t.id?700:500,color:tab===t.id?"#B8860B":C.label}}>{t.l}</span>
            </button>
          ))}
        </div>
        <div style={{padding:"12px 12px 20px",borderTop:"1px solid rgba(0,0,0,.06)"}}>
          <button onClick={()=>setWizard(true)} style={{width:"100%",background:"linear-gradient(135deg,#C9A227,#B8860B)",border:"none",borderRadius:12,padding:"11px 16px",color:"white",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 2px 8px rgba(184,134,11,.35)"}}>+ Nuova Riparazione</button>
        </div>
      </div>
      {/* Content */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>
        <div style={{background:"rgba(242,242,247,.96)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(0,0,0,.08)",padding:"14px 24px 12px",flexShrink:0}}>
          <div style={{fontSize:22,fontWeight:800,color:C.label,letterSpacing:"-.5px"}}>{pageTitle}</div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"20px 24px 40px"}}>
          {PAGES}
        </div>
      </div>
      {MODALS}
    </div>
  );

  /* ── Layout mobile (bottom tabs) ── */
  return (
    <div style={{minHeight:"100vh",background:C.surface,fontFamily:"-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif",maxWidth:640,margin:"0 auto"}}>
      <div style={{background:"rgba(242,242,247,.96)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(0,0,0,.08)",padding:"12px 20px 10px",position:"sticky",top:0,zIndex:30}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <img src={zerrilloLogo} alt="Zerrillo" style={{height:32,width:"auto",objectFit:"contain"}}/>
            <div>
              <div style={{fontSize:20,fontWeight:800,color:C.label,letterSpacing:"-.5px"}}>{pageTitle}</div>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:7,height:7,borderRadius:4,background:syncing?C.orange:C.green,transition:"background .3s"}}/>
                <div style={{fontSize:11,color:C.secondary}}>{syncing?"Salvataggio…":"Sincronizzato"}</div>
              </div>
            </div>
          </div>
          <button onClick={()=>setWizard(true)} style={{background:"linear-gradient(135deg,#C9A227,#B8860B)",border:"none",borderRadius:12,padding:"9px 18px",color:"white",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 2px 8px rgba(184,134,11,.4)"}}>+ Riparazione</button>
        </div>
      </div>
      <div style={{padding:"16px 16px 100px"}}>
        {PAGES}
      </div>
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:640,background:"rgba(249,249,249,.96)",backdropFilter:"blur(20px)",borderTop:"1px solid rgba(0,0,0,.1)",display:"flex",zIndex:30,paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
        {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"8px 0 10px",border:"none",background:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}><span style={{fontSize:22,lineHeight:1}}>{t.icon}</span><span style={{fontSize:10,fontWeight:700,color:tab===t.id?"#B8860B":C.secondary}}>{t.l}</span></button>)}
      </div>
      {MODALS}
    </div>
  );
}

export default function App() {
  const [unlocked,setUnlocked]=useState(false);
  if(!unlocked)return <PinScreen onUnlock={()=>setUnlocked(true)}/>;
  return <MainApp/>;
}