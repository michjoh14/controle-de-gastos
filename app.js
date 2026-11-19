'use strict';
/* Controle de Gastos — tudo roda no navegador; os dados ficam salvos neste dispositivo (localStorage). */

const KEY = 'controle-gastos-dados-v1';
const PAGO = ['Pago', 'Quitado'];
const ABERTO = ['Pendente', 'Atrasado', 'Devendo'];
const SITUACOES = ['Pendente', 'Pago', 'Quitado', 'Atrasado', 'Devendo', 'Cancelado'];
const PERIODOS = { Mensal: 1, Trimestral: 3, Semestral: 6, Anual: 12 };
const SIT_ASS = ['Ativo', 'Pausado', 'Cancelado'];
const CORES = ['#0f7a5c', '#3b6fd8', '#d1882a', '#8a4fc9', '#c94f6d', '#2a9bb0', '#7a8a1f', '#b0563a', '#5a6b8c', '#9a7b4f', '#4f9a6b', '#a04f9a'];
const GOOGLE_G = '<svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
const CATS_PADRAO = ['Bancos e cartões', 'Contas da casa', 'Telefone', 'Parcelados', 'Dízimo', 'Pessoas', 'Veículo e documentos', 'Investimentos', 'Outros'];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = v => brl.format(v || 0);
const pct = v => (isFinite(v) ? Math.round(v * 100) : 0) + '%';
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const mesAtual = () => hoje().slice(0, 7);
const addMes = (ym, n) => { let [y, m] = ym.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; };
const addMesData = (iso, n) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const ym = addMes(`${y}-${String(m).padStart(2, '0')}`, n);
  const [ny, nm] = ym.split('-').map(Number);
  const last = new Date(ny, nm, 0).getDate();
  return `${ym}-${String(Math.min(d, last)).padStart(2, '0')}`;
};
const nomeMes = (ym, curto) => {
  const [y, m] = ym.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: curto ? 'short' : 'long' }).replace('.', '');
  return curto ? s : `${s} ${y}`;
};
const dataBR = iso => iso ? iso.split('-').reverse().join('/') : '';
const diasAte = iso => Math.round((new Date(iso + 'T00:00') - new Date(hoje() + 'T00:00')) / 864e5);
const parseValor = s => {
  s = String(s ?? '').replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const v = parseFloat(s); return isFinite(v) ? Math.round(v * 100) / 100 : NaN;
};
const valorInput = v => (v || v === 0) ? String(v.toFixed ? v.toFixed(2) : v).replace('.', ',') : '';

/* ---------- Dados ---------- */
let db = carregar();
let mes = mesAtual();
let view = 'mes';
let anoHist = null;
let busca = '';

function vazio() {
  return { lancamentos: [], receitas: [], assinaturas: [], itens: {}, categorias: [...CATS_PADRAO], ultimoBackup: null, iniciado: false };
}
function carregar() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return Object.assign(vazio(), JSON.parse(raw));
  } catch (e) { console.warn(e); }
  return vazio();
}
function salvar(semNuvem) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Não consegui salvar neste navegador. Exporte um backup.'); }
  if (!semNuvem) nuvem.enviar();
}

/* ---------- Sincronização (Firebase: login com Google + Firestore) ---------- */
const nuvem = {
  ok: false, usuario: null, ref: null, estado: 'desligado', timer: null, ultimoTexto: null,
  iniciar() {
    if (!window.firebase || !window.FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey) return;
    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      const fs = firebase.firestore();
      fs.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      this.ok = true;
      firebase.auth().getRedirectResult().catch(e => this.erro(e));
      firebase.auth().onAuthStateChanged(u => this.mudouUsuario(u));
    } catch (e) { console.warn(e); }
  },
  async entrar() {
    if (!this.ok) { toast('Sincronização indisponível no momento. Verifique a internet.'); return; }
    const p = new firebase.auth.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    try { await firebase.auth().signInWithPopup(p); }
    catch (e) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) firebase.auth().signInWithRedirect(p);
      else this.erro(e);
    }
  },
  sair() { firebase.auth().signOut(); toast('Você saiu. Os dados continuam neste aparelho.'); },
  erro(e) {
    if (!e || e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    console.warn(e); toast('Não consegui entrar: ' + (e.message || e.code));
  },
  mudouUsuario(u) {
    if (this.unsub) { this.unsub(); this.unsub = null; }
    this.usuario = u; this.ref = null; this.ultimoTexto = null;
    if (!u) { this.estado = 'desligado'; render(); return; }
    this.estado = 'sincronizando'; render();
    this.ref = firebase.firestore().collection('usuarios').doc(u.uid);
    let primeira = true;
    this.unsub = this.ref.onSnapshot({ includeMetadataChanges: true }, snap => {
      if (snap.metadata.hasPendingWrites) { this.estado = 'enviando'; atualizarSync(); return; }
      this.estado = snap.metadata.fromCache ? 'offline' : 'ok';
      if (!snap.exists) {
        if (primeira && db.iniciado) this.enviar(true); // primeira vez: sobe o que já está neste aparelho
        primeira = false; atualizarSync(); return;
      }
      const texto = snap.data().dados;
      if (texto && texto !== this.ultimoTexto && texto !== textoDb()) {
        if (primeira && db.iniciado && db.lancamentos.length) {
          try { localStorage.setItem(KEY + '-antes-de-sincronizar', JSON.stringify(db)); } catch (e) {}
        }
        const novo = JSON.parse(texto);
        db = Object.assign(vazio(), novo, { iniciado: true });
        this.ultimoTexto = texto;
        salvar(true); render();
        if (primeira) toast('Dados sincronizados com sua conta Google');
      } else { this.ultimoTexto = texto; atualizarSync(); }
      primeira = false;
    }, e => { this.estado = 'erro'; console.warn(e); atualizarSync(); });
  },
  enviar(agora) {
    if (!this.ref) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const texto = textoDb();
      if (texto === this.ultimoTexto) return;
      this.ultimoTexto = texto;
      this.ref.set({ dados: texto, atualizado: firebase.firestore.FieldValue.serverTimestamp(), app: 'controle-gastos' })
        .catch(e => { this.estado = 'erro'; console.warn(e); atualizarSync(); });
    }, agora ? 0 : 500);
  },
};
function textoDb() { const { iniciado, ...resto } = db; return JSON.stringify(resto); }
const SYNC_TXT = { desligado: 'Só neste aparelho', sincronizando: 'Sincronizando…', enviando: 'Salvando na nuvem…', ok: 'Sincronizado', offline: 'Sem internet — sincroniza depois', erro: 'Erro ao sincronizar' };
function atualizarSync() {
  const el = $('#syncBadge'); if (!el) return;
  el.dataset.estado = nuvem.estado;
  el.title = SYNC_TXT[nuvem.estado];
  el.querySelector('span').textContent = nuvem.usuario ? SYNC_TXT[nuvem.estado] : 'Entrar';
  const s = document.getElementById('syncStatus'); if (s) s.textContent = SYNC_TXT[nuvem.estado];
}
let desfazer = null;
function mudar(fn, msg) {
  const antes = JSON.stringify(db);
  fn();
  salvar();
  desfazer = antes;
  render();
  if (msg) toast(msg, true);
}

const doMes = ym => db.lancamentos.filter(l => l.comp === ym);
const recDoMes = ym => db.receitas.filter(r => r.comp === ym);
const ehPago = l => PAGO.includes(l.situacao);
const ehAberto = l => ABERTO.includes(l.situacao);
const ehAtrasado = l => ehAberto(l) && (l.situacao === 'Atrasado' || (l.venc && l.venc < hoje()));
const corCat = c => CORES[Math.max(0, db.categorias.indexOf(c)) % CORES.length];
const catDoItem = item => db.itens[item] || '';

function resumo(ym) {
  const ls = doMes(ym).filter(l => l.situacao !== 'Cancelado');
  const receita = recDoMes(ym).reduce((s, r) => s + r.valor, 0);
  const contas = ls.reduce((s, l) => s + l.valor, 0);
  const pago = ls.filter(ehPago).reduce((s, l) => s + l.valor, 0);
  const aberto = ls.filter(ehAberto).reduce((s, l) => s + l.valor, 0);
  return { receita, contas, pago, aberto, saldo: receita - contas, n: ls.length };
}
function situacaoPill(l) {
  if (l.situacao === 'Cancelado') return '<span class="pill">Cancelado</span>';
  if (ehPago(l)) return `<span class="pill ok">${esc(l.situacao)}</span>`;
  if (ehAtrasado(l)) return '<span class="pill bad">Atrasado</span>';
  if (l.venc) {
    const d = diasAte(l.venc);
    if (d === 0) return '<span class="pill warn">Vence hoje</span>';
    if (d > 0 && d <= 5) return `<span class="pill warn">Vence em ${d} d</span>`;
  }
  return `<span class="pill warn">${esc(l.situacao)}</span>`;
}

/* ---------- Render ---------- */
const main = $('#main');
function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('#monthLabel').textContent = nomeMes(mes);
  $('#monthnav').hidden = view !== 'mes' || !db.iniciado;
  $('#fab').hidden = view === 'ajustes' || !db.iniciado;
  $('#fab').setAttribute('aria-label', view === 'assinaturas' ? 'Adicionar assinatura' : 'Adicionar conta');
  atualizarSync();
  if (!db.iniciado) { main.innerHTML = telaInicial(); return; }
  main.innerHTML = { mes: telaMes, historico: telaHistorico, assinaturas: telaAssinaturas, ajustes: telaAjustes }[view]();
}

function telaInicial() {
  return `
  <section class="panel empty" style="padding:36px 18px">
    <img src="icons/icon-192.png" width="72" height="72" alt="" style="border-radius:18px">
    <b>Bem-vindo ao seu Controle de Gastos</b>
    <p style="max-width:440px;margin:0">Entre com sua conta Google para ver os mesmos dados no computador e no celular. Se for a primeira vez, importe também o arquivo com seus dados (<em>.json</em>).</p>
    <div class="btn-row" style="justify-content:center">
      ${nuvem.usuario ? '' : `<button class="btn primary" data-act="entrar">${GOOGLE_G} Entrar com Google</button>`}
      <button class="btn ${nuvem.usuario ? 'primary' : ''}" data-act="importar">Importar meus dados</button>
      <button class="btn" data-act="comecar">Começar do zero</button>
    </div>
    <p class="sub" style="margin:0">${nuvem.usuario ? `Conectado como ${esc(nuvem.usuario.email)} — ${SYNC_TXT[nuvem.estado]}` : 'Sem entrar, os dados ficam só neste aparelho.'}</p>
  </section>`;
}

function telaMes() {
  const r = resumo(mes);
  const ls = doMes(mes).sort((a, b) => ordemConta(a) - ordemConta(b) || (a.venc || '9').localeCompare(b.venc || '9') || a.item.localeCompare(b.item));
  const recs = recDoMes(mes);
  const comprometida = r.receita ? r.contas / r.receita : 0;
  const pctPago = r.contas ? r.pago / r.contas : 0;

  const abertasOutros = db.lancamentos.filter(l => l.comp !== mes && ehAberto(l)).sort((a, b) => a.comp.localeCompare(b.comp));
  const totOutros = abertasOutros.reduce((s, l) => s + l.valor, 0);
  const anterior = addMes(mes, -1);
  const podeCopiar = doMes(anterior).some(l => l.situacao !== 'Cancelado');

  const porCat = {};
  ls.filter(l => l.situacao !== 'Cancelado').forEach(l => porCat[l.cat] = (porCat[l.cat] || 0) + l.valor);
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] || 1;

  return `
  <section class="panel hero">
    <div class="hero-main">
      <div>
        <div class="eyebrow">Sobra do mês</div>
        <div class="hero-big num">${money(r.saldo)}</div>
      </div>
      <div class="hero-note num">${r.receita ? `${pct(comprometida)} da renda comprometida` : 'Sem receita lançada neste mês'}</div>
    </div>
    <div class="meter" aria-hidden="true"><span style="width:${Math.min(100, pctPago * 100)}%"></span></div>
    <div class="hero-meter-row num"><span>${r.n ? `${pct(pctPago)} das contas pagas` : 'Nenhuma conta lançada'}</span><span>${money(r.pago)} de ${money(r.contas)}</span></div>
  </section>

  <section class="stats">
    <div class="stat"><span class="eyebrow">Receita</span><b class="num">${money(r.receita)}</b></div>
    <div class="stat"><span class="eyebrow">Contas</span><b class="num">${money(r.contas)}</b></div>
    <div class="stat ok"><span class="eyebrow">Já pago</span><b class="num">${money(r.pago)}</b></div>
    <div class="stat ${r.aberto ? 'warn' : ''}"><span class="eyebrow">Em aberto</span><b class="num">${money(r.aberto)}</b></div>
  </section>

  ${abertasOutros.length ? `
  <div class="alert">
    <span class="dot"></span>
    <div><strong>${abertasOutros.length} ${abertasOutros.length > 1 ? 'contas' : 'conta'} em aberto de outros meses · ${money(totOutros)}</strong>
    <span class="sub">${abertasOutros.slice(0, 3).map(l => `${esc(l.item)} (${nomeMes(l.comp, true)}/${l.comp.slice(2, 4)})`).join(', ')}${abertasOutros.length > 3 ? '…' : ''}</span></div>
    <button class="btn small" data-act="irmes" data-mes="${abertasOutros[0].comp}">Ver</button>
  </div>` : ''}

  <section class="panel">
    <div class="panel-head">
      <div><h2>Contas do mês</h2><span class="sub">Toque no círculo para marcar como paga</span></div>
      <div class="btn-row">
        ${podeCopiar ? `<button class="btn small ${ls.length ? '' : 'primary'}" data-act="copiar">Copiar de ${nomeMes(anterior, true)}</button>` : ''}
        <button class="btn small" data-act="nova-conta">+ Conta</button>
      </div>
    </div>
    ${ls.length ? `<div class="list">${ls.map(linhaConta).join('')}</div>` : `
      <div class="empty"><b>Nenhuma conta em ${nomeMes(mes)}</b>
      <span>${podeCopiar ? `Use “Copiar de ${nomeMes(anterior, true)}” para trazer as contas fixas do mês passado já como pendentes.` : 'Toque em + para lançar a primeira conta.'}</span></div>`}
  </section>

  <section class="panel">
    <div class="panel-head">
      <h2>Receitas</h2>
      <button class="btn small" data-act="nova-receita">+ Receita</button>
    </div>
    ${recs.length ? `<div class="list">${recs.map(rc => `
      <div class="row">
        <span class="check na"></span>
        <div class="row-main" data-act="editar-receita" data-id="${rc.id}">
          <span class="row-title">${esc(rc.fonte)}</span>
          ${rc.obs ? `<span class="row-meta">${esc(rc.obs)}</span>` : ''}
        </div>
        <div class="row-end"><span class="row-value num pos">${money(rc.valor)}</span></div>
      </div>`).join('')}</div>` : `<div class="empty" style="padding:12px"><span>Nenhuma receita neste mês. ${db.receitas.length ? 'Toque em “+ Receita” — o último salário já vem preenchido.' : ''}</span></div>`}
  </section>

  ${cats.length ? `
  <section class="panel">
    <div class="panel-head"><h2>Para onde foi o dinheiro</h2></div>
    <div class="cat-bars">${cats.map(([c, v]) => `
      <div class="cat-bar" style="--c:${corCat(c)}">
        <div class="cat-bar-top"><span class="chip">${esc(c)}</span><span class="num"><b>${money(v)}</b> <span class="sub">${r.contas ? pct(v / r.contas) : ''}</span></span></div>
        <div class="cat-bar-track"><span style="width:${(v / maxCat) * 100}%"></span></div>
      </div>`).join('')}</div>
  </section>` : ''}`;
}
function ordemConta(l) { return ehAtrasado(l) ? 0 : ehAberto(l) ? 1 : ehPago(l) ? 2 : 3; }
const ICON_OK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function linhaConta(l) {
  const meta = [`<span class="chip" style="--c:${corCat(l.cat)}">${esc(l.cat)}</span>`];
  if (l.parcela) meta.push(`<span>parcela ${esc(l.parcela)}</span>`);
  if (ehPago(l) && l.pago) meta.push(`<span>pago ${dataBR(l.pago)}</span>`);
  else if (l.venc) meta.push(`<span>vence ${dataBR(l.venc)}</span>`);
  if (l.obs) meta.push(`<span>${esc(l.obs)}</span>`);
  const podeMarcar = l.situacao !== 'Cancelado';
  return `
  <div class="row ${l.situacao === 'Cancelado' ? 'cancel' : ''}">
    <button class="check ${ehPago(l) ? 'on' : ''} ${podeMarcar ? '' : 'na'}" data-act="toggle" data-id="${l.id}" aria-label="${ehPago(l) ? 'Marcar como pendente' : 'Marcar como paga'}">${ICON_OK}</button>
    <div class="row-main" data-act="editar-conta" data-id="${l.id}">
      <span class="row-title">${esc(l.item)}</span>
      <span class="row-meta">${meta.join('<span>·</span>')}</span>
    </div>
    <div class="row-end"><span class="row-value num">${money(l.valor)}</span>${situacaoPill(l)}</div>
  </div>`;
}

function telaHistorico() {
  const anos = [...new Set([...db.lancamentos, ...db.receitas].map(x => x.comp.slice(0, 4)))].sort();
  if (!anos.length) return `<section class="panel empty"><b>Ainda não há histórico</b><span>Lance contas e receitas para ver a evolução aqui.</span></section>`;
  if (!anoHist || !anos.includes(anoHist)) anoHist = anos.includes(mes.slice(0, 4)) ? mes.slice(0, 4) : anos[anos.length - 1];
  const meses = Array.from({ length: 12 }, (_, i) => `${anoHist}-${String(i + 1).padStart(2, '0')}`);
  const dados = meses.map(m => ({ m, ...resumo(m) }));
  const tot = dados.reduce((a, d) => ({ receita: a.receita + d.receita, contas: a.contas + d.contas }), { receita: 0, contas: 0 });
  const comDados = dados.filter(d => d.contas || d.receita).length || 1;

  const porCat = {};
  db.lancamentos.filter(l => l.comp.startsWith(anoHist) && l.situacao !== 'Cancelado').forEach(l => porCat[l.cat] = (porCat[l.cat] || 0) + l.valor);
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] || 1;

  const q = busca.trim().toLowerCase();
  const achados = q ? db.lancamentos.filter(l => `${l.item} ${l.cat} ${l.obs} ${l.parcela}`.toLowerCase().includes(q)).sort((a, b) => b.comp.localeCompare(a.comp)) : [];

  return `
  <section class="panel">
    <div class="panel-head">
      <h2>Ano a ano</h2>
      <div class="seg" role="tablist">${anos.map(a => `<button class="${a === anoHist ? 'on' : ''}" data-act="ano" data-ano="${a}">${a}</button>`).join('')}</div>
    </div>
    <section class="stats" style="margin-bottom:14px">
      <div class="stat"><span class="eyebrow">Receita no ano</span><b class="num">${money(tot.receita)}</b></div>
      <div class="stat"><span class="eyebrow">Contas no ano</span><b class="num">${money(tot.contas)}</b></div>
      <div class="stat ${tot.receita - tot.contas >= 0 ? 'ok' : 'bad'}"><span class="eyebrow">Sobra no ano</span><b class="num">${money(tot.receita - tot.contas)}</b></div>
      <div class="stat"><span class="eyebrow">Média de contas/mês</span><b class="num">${money(tot.contas / comDados)}</b></div>
    </section>
    <div class="legend"><span><i style="background:color-mix(in srgb, var(--accent) 28%, var(--surface-2))"></i>Receita</span><span><i style="background:var(--accent)"></i>Contas</span><span>Toque num mês para abrir</span></div>
    <div class="chart-wrap">${grafico(dados)}</div>
  </section>

  ${cats.length ? `
  <section class="panel">
    <div class="panel-head"><h2>Por categoria em ${anoHist}</h2></div>
    <div class="cat-bars">${cats.map(([c, v]) => `
      <div class="cat-bar" style="--c:${corCat(c)}">
        <div class="cat-bar-top"><span class="chip">${esc(c)}</span><span class="num"><b>${money(v)}</b> <span class="sub">${money(v / comDados)}/mês</span></span></div>
        <div class="cat-bar-track"><span style="width:${(v / maxCat) * 100}%"></span></div>
      </div>`).join('')}</div>
  </section>` : ''}

  <section class="panel">
    <div class="panel-head"><h2>Mês a mês</h2></div>
    <div class="chart-wrap"><table class="tbl num">
      <thead><tr><th>Mês</th><th class="r">Receita</th><th class="r">Contas</th><th class="r">Sobra</th><th class="r">Em aberto</th></tr></thead>
      <tbody>${dados.filter(d => d.contas || d.receita).map(d => `
        <tr class="clickable" data-act="irmes" data-mes="${d.m}">
          <td style="text-transform:capitalize">${nomeMes(d.m, true)}</td>
          <td class="r">${money(d.receita)}</td><td class="r">${money(d.contas)}</td>
          <td class="r ${d.saldo >= 0 ? 'pos' : 'neg'}">${money(d.saldo)}</td>
          <td class="r">${d.aberto ? `<span class="pill warn">${money(d.aberto)}</span>` : '—'}</td>
        </tr>`).join('')}</tbody>
    </table></div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>Procurar lançamento</h2></div>
    <input class="search" id="busca" type="search" placeholder="Ex.: Celesc, Inter, multa…" value="${esc(busca)}" autocomplete="off">
    ${q ? `<p class="sub">${achados.length} encontrados · total ${money(achados.filter(l => l.situacao !== 'Cancelado').reduce((s, l) => s + l.valor, 0))}</p>
    <div class="list">${achados.slice(0, 60).map(l => linhaConta(l).replace('<span class="row-title">', `<span class="row-title"><span class="sub" style="text-transform:capitalize">${nomeMes(l.comp, true)}/${l.comp.slice(2, 4)} · </span>`)).join('')}</div>` : ''}
  </section>`;
}

function grafico(dados) {
  const W = 760, H = 240, pl = 56, pb = 26, pt = 10, pr = 8;
  const max = Math.max(1, ...dados.map(d => Math.max(d.receita, d.contas)));
  const passo = niceStep(max / 4);
  const topo = Math.ceil(max / passo) * passo;
  const y = v => pt + (H - pt - pb) * (1 - v / topo);
  const bw = (W - pl - pr) / 12;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" style="min-width:560px" role="img" aria-label="Receita e contas por mês">`;
  for (let v = 0; v <= topo + 1e-6; v += passo) {
    s += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? (v / 1000).toLocaleString('pt-BR') + ' mil' : v}</text>`;
  }
  dados.forEach((d, i) => {
    const x = pl + i * bw, w = bw * 0.32;
    const sel = d.m === mes ? ' bar-sel' : '';
    if (d.receita) s += `<rect class="bar-in" x="${x + bw * 0.16}" y="${y(d.receita)}" width="${w}" height="${y(0) - y(d.receita)}" rx="3"/>`;
    if (d.contas) s += `<rect class="bar-out${sel}" x="${x + bw * 0.16 + w + 2}" y="${y(d.contas)}" width="${w}" height="${y(0) - y(d.contas)}" rx="3"/>`;
    s += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${nomeMes(d.m, true)}</text>`;
    s += `<rect class="hit" x="${x}" y="0" width="${bw}" height="${H}" data-act="irmes" data-mes="${d.m}"><title>${nomeMes(d.m)}: receita ${money(d.receita)}, contas ${money(d.contas)}</title></rect>`;
  });
  return s + '</svg>';
}
function niceStep(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

function custoMensal(a) { return a.preco / (PERIODOS[a.periodo] || 1); }
function telaAssinaturas() {
  const ativas = db.assinaturas.filter(a => a.situacao === 'Ativo');
  const mensal = ativas.reduce((s, a) => s + custoMensal(a), 0);
  const lista = [...db.assinaturas].sort((a, b) => (a.situacao !== 'Ativo') - (b.situacao !== 'Ativo') || (a.proxima || '9').localeCompare(b.proxima || '9'));
  return `
  <section class="stats" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
    <div class="stat"><span class="eyebrow">Por mês</span><b class="num">${money(mensal)}</b></div>
    <div class="stat"><span class="eyebrow">Por ano</span><b class="num">${money(mensal * 12)}</b></div>
    <div class="stat"><span class="eyebrow">Ativas</span><b class="num">${ativas.length}</b></div>
  </section>
  <section class="panel">
    <div class="panel-head"><div><h2>Assinaturas</h2><span class="sub">Só um cadastro: não soma nas contas do mês (já vem na fatura do cartão).</span></div>
      <button class="btn small" data-act="nova-assinatura">+ Assinatura</button></div>
    ${lista.length ? `<div class="list">${lista.map(a => {
      let alerta = '';
      if (a.situacao === 'Ativo' && a.proxima) {
        const d = diasAte(a.proxima);
        alerta = d < 0 ? `<span class="pill bad">Renovou há ${-d} d</span>` : d <= 7 ? `<span class="pill warn">Renova em ${d} d</span>` : `<span class="pill">${dataBR(a.proxima)}</span>`;
      } else if (a.situacao !== 'Ativo') alerta = `<span class="pill">${esc(a.situacao)}</span>`;
      return `
      <div class="row ${a.situacao === 'Cancelado' ? 'cancel' : ''}">
        <span class="check na"></span>
        <div class="row-main" data-act="editar-assinatura" data-id="${a.id}">
          <span class="row-title">${esc(a.servico)}</span>
          <span class="row-meta"><span>${money(a.preco)} ${esc(a.periodo.toLowerCase())}</span>${a.periodo !== 'Mensal' ? `<span>· ${money(custoMensal(a))}/mês</span>` : ''}${a.obs ? `<span>· ${esc(a.obs)}</span>` : ''}</span>
        </div>
        <div class="row-end"><span class="row-value num">${money(custoMensal(a) * 12)}<span class="sub">/ano</span></span>${alerta}</div>
      </div>`;
    }).join('')}</div>` : `<div class="empty"><b>Nenhuma assinatura</b><span>Cadastre streaming, nuvem, apps… para saber quanto custam por ano.</span></div>`}
  </section>`;
}

function telaAjustes() {
  const itens = Object.entries(db.itens).sort((a, b) => a[0].localeCompare(b[0]));
  const diasBackup = db.ultimoBackup ? -diasAte(db.ultimoBackup.slice(0, 10)) : null;
  return `
  <section class="panel">
    <div class="panel-head"><div><h2>Computador e celular</h2><span class="sub">Entre com a mesma conta Google em cada aparelho e tudo fica igual nos dois.</span></div></div>
    ${nuvem.usuario ? `
      <div class="kv"><span>Conta</span><b>${esc(nuvem.usuario.email)}</b></div>
      <div class="kv"><span>Situação</span><b id="syncStatus">${SYNC_TXT[nuvem.estado]}</b></div>
      <div class="btn-row" style="margin-top:8px"><button class="btn" data-act="sair">Sair da conta</button></div>`
    : `<div class="btn-row"><button class="btn primary" data-act="entrar">${GOOGLE_G} Entrar com Google</button></div>
       ${nuvem.ok ? '' : '<p class="sub">A sincronização precisa de internet para começar.</p>'}`}
  </section>

  <section class="panel">
    <div class="panel-head"><div><h2>Backup</h2><span class="sub">${nuvem.usuario ? 'Seus dados já ficam guardados na sua conta. Um backup extra de vez em quando não faz mal.' : 'Sem entrar com Google, os dados ficam só neste navegador. Exporte um backup de vez em quando.'}</span></div></div>
    ${diasBackup === null || diasBackup > 30 ? `<div class="alert warn" style="margin-bottom:12px"><span class="dot"></span><div><strong>${diasBackup === null ? 'Você ainda não exportou nenhum backup' : `Último backup há ${diasBackup} dias`}</strong><span class="sub">Se limpar os dados do navegador, perde tudo que não estiver no backup.</span></div></div>` : `<p class="sub">Último backup: ${dataBR(db.ultimoBackup.slice(0, 10))}</p>`}
    <div class="btn-row">
      <button class="btn primary" data-act="exportar">Exportar backup</button>
      <button class="btn" data-act="importar">Importar backup</button>
    </div>
    <p class="sub">${db.lancamentos.length} contas · ${db.receitas.length} receitas · ${db.assinaturas.length} assinaturas</p>
  </section>

  <section class="panel">
    <div class="panel-head"><div><h2>Itens e categorias</h2><span class="sub">A categoria escolhida aqui é usada automaticamente quando você lança o item.</span></div>
      <button class="btn small" data-act="nova-categoria">+ Categoria</button></div>
    <div class="settings-list">${itens.map(([nome, cat]) => `
      <div class="kv"><span>${esc(nome)}</span>
        <select data-item="${esc(nome)}" aria-label="Categoria de ${esc(nome)}">${db.categorias.map(c => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>`).join('') || '<span class="sub">Os itens aparecem aqui conforme você lança contas.</span>'}
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>Instalar no computador ou celular</h2></div>
    <p class="sub" style="margin:0">No Chrome, clique no ícone de instalar na barra de endereço (ou menu ⋮ → <b>Transmitir, salvar e compartilhar</b> → <b>Instalar página como app</b>). No celular: menu ⋮ → <b>Adicionar à tela inicial</b>.</p>
  </section>

  <section class="panel" id="zona-perigo">
    <div class="panel-head"><h2>Apagar tudo</h2></div>
    <p class="sub" style="margin-top:0">Remove todos os dados deste navegador. Exporte um backup antes.</p>
    <button class="btn danger" data-act="apagar-tudo">Apagar todos os dados…</button>
  </section>`;
}

/* ---------- Formulários ---------- */
const sheet = $('#sheet'), form = $('#sheetForm');
let onSubmit = null;
function abrirFolha(html, submit) {
  form.innerHTML = html;
  onSubmit = submit;
  sheet.showModal();
  const first = form.querySelector('[autofocus]');
  if (first && matchMedia('(min-width: 760px)').matches) first.focus();
}
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });
form.addEventListener('submit', e => {
  e.preventDefault();
  if (e.submitter && e.submitter.value === 'cancel') { sheet.close(); return; }
  if (onSubmit && onSubmit(new FormData(form)) !== false) sheet.close();
});
function erro(campo, msg) {
  const el = form.querySelector(`[name="${campo}"]`);
  if (el) { el.setCustomValidity(msg); el.reportValidity(); el.addEventListener('input', () => el.setCustomValidity(''), { once: true }); }
  return false;
}
const cabecalho = t => `<div class="sheet-head"><h2>${t}</h2><button class="icon-btn" value="cancel" aria-label="Fechar">×</button></div>`;
function confirmaApagar(oque, fn) {
  return `<div id="apagarBox" hidden class="confirm-box"><span>Apagar ${oque}? Dá para desfazer logo depois.</span>
    <div class="btn-row"><button type="button" class="btn danger" data-sheet="apagar-sim">Sim, apagar</button><button type="button" class="btn" data-sheet="apagar-nao">Não</button></div></div>`;
}
let apagarAtual = null;
form.addEventListener('click', e => {
  const b = e.target.closest('[data-sheet]'); if (!b) return;
  const a = b.dataset.sheet;
  if (a === 'apagar') { $('#apagarBox').hidden = false; b.hidden = true; }
  if (a === 'apagar-nao') { $('#apagarBox').hidden = true; form.querySelector('[data-sheet="apagar"]').hidden = false; }
  if (a === 'apagar-sim' && apagarAtual) { apagarAtual(); sheet.close(); }
  if (a === 'sit') {
    form.querySelectorAll('[data-sheet="sit"]').forEach(x => x.classList.toggle('on', x === b));
    form.elements.situacao.value = b.dataset.v;
    const pg = form.elements.pago;
    if (pg && PAGO.includes(b.dataset.v) && !pg.value) pg.value = hoje();
    if (pg && !PAGO.includes(b.dataset.v)) pg.value = '';
  }
});

function formConta(l) {
  const novo = !l;
  l = l || { comp: mes, situacao: 'Pendente', valor: '', item: '', cat: '', parcela: '', venc: '', pago: '', obs: '' };
  apagarAtual = novo ? null : () => mudar(() => { db.lancamentos = db.lancamentos.filter(x => x.id !== l.id); }, `“${l.item}” apagada`);
  abrirFolha(`
    ${cabecalho(novo ? 'Nova conta' : 'Editar conta')}
    <div class="fields">
      <div class="field full"><label for="f-item">Banco, conta ou item</label>
        <input id="f-item" name="nome" list="lista-itens" value="${esc(l.item)}" required autofocus autocomplete="off" placeholder="Ex.: Inter, Celesc, Internet">
        <datalist id="lista-itens">${Object.keys(db.itens).sort().map(i => `<option value="${esc(i)}">`).join('')}</datalist></div>
      <div class="field"><label for="f-valor">Valor (R$)</label><input id="f-valor" class="big num" name="valor" inputmode="decimal" value="${valorInput(l.valor)}" required placeholder="0,00"></div>
      <div class="field"><label for="f-cat">Categoria</label><select id="f-cat" name="cat">${db.categorias.map(c => `<option ${c === (l.cat || catDoItem(l.item)) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="field full"><label>Situação</label>
        <input type="hidden" name="situacao" value="${esc(l.situacao)}">
        <div class="status-pick">${SITUACOES.map(s => `<button type="button" data-sheet="sit" data-v="${s}" class="${s === l.situacao ? 'on' : ''}">${s}</button>`).join('')}</div></div>
      <div class="field"><label for="f-venc">Vencimento</label><input id="f-venc" type="date" name="venc" value="${l.venc || ''}"></div>
      <div class="field"><label for="f-pago">Data do pagamento</label><input id="f-pago" type="date" name="pago" value="${l.pago || ''}"></div>
      <div class="field"><label for="f-comp">Mês de referência</label><input id="f-comp" type="month" name="comp" value="${l.comp}" required></div>
      <div class="field"><label for="f-parc">Parcela</label><input id="f-parc" name="parcela" value="${esc(l.parcela)}" placeholder="Ex.: 3/10"></div>
      ${novo ? `<label class="field full" style="display:flex;gap:8px;align-items:center;font-size:14px" id="lbl-parc" hidden><input type="checkbox" name="gerar" style="width:auto"> Criar também as próximas parcelas como pendentes</label>` : ''}
      <div class="field full"><label for="f-obs">Observação</label><input id="f-obs" name="obs" value="${esc(l.obs)}" placeholder="Opcional — ex.: pago com Nubank"></div>
    </div>
    ${novo ? '' : confirmaApagar('esta conta')}
    <div class="sheet-actions">
      ${novo ? '<span></span>' : '<button type="button" class="btn danger" data-sheet="apagar">Apagar</button>'}
      <div class="btn-row"><button class="btn" value="cancel">Cancelar</button><button class="btn primary" value="ok">Salvar</button></div>
    </div>`, fd => {
    const valor = parseValor(fd.get('valor'));
    const item = String(fd.get('nome')).trim();
    if (!item) return erro('nome', 'Diga qual é a conta.');
    if (!isFinite(valor) || valor < 0) return erro('valor', 'Digite um valor, ex.: 131,65');
    const dados = { item, valor, cat: fd.get('cat'), situacao: fd.get('situacao'), venc: fd.get('venc') || null, pago: fd.get('pago') || null, comp: fd.get('comp') || mes, parcela: String(fd.get('parcela')).trim(), obs: String(fd.get('obs')).trim() };
    mudar(() => {
      db.itens[item] = dados.cat;
      if (novo) {
        db.lancamentos.push({ id: uid('l'), ...dados });
        const m = dados.parcela.match(/^(\d+)\s*\/\s*(\d+)$/);
        if (fd.get('gerar') && m) {
          for (let k = +m[1] + 1, n = 1; k <= +m[2]; k++, n++) {
            db.lancamentos.push({ id: uid('l'), ...dados, comp: addMes(dados.comp, n), parcela: `${k}/${m[2]}`, situacao: 'Pendente', pago: null, venc: addMesData(dados.venc, n) });
          }
        }
      } else Object.assign(db.lancamentos.find(x => x.id === l.id), dados);
    }, novo ? 'Conta adicionada' : 'Conta salva');
  });
  const it = form.elements.nome, cat = form.elements.cat, parc = form.elements.parcela, lbl = $('#lbl-parc');
  it.addEventListener('input', () => { const c = catDoItem(it.value.trim()); if (c) cat.value = c; });
  if (lbl) parc.addEventListener('input', () => { lbl.hidden = !/^\d+\s*\/\s*\d+$/.test(parc.value.trim()); });
}

function formReceita(r) {
  const novo = !r;
  const ultima = [...db.receitas].sort((a, b) => b.comp.localeCompare(a.comp))[0];
  r = r || { comp: mes, fonte: ultima?.fonte || 'Salário', valor: ultima?.valor ?? '', obs: '' };
  apagarAtual = novo ? null : () => mudar(() => { db.receitas = db.receitas.filter(x => x.id !== r.id); }, 'Receita apagada');
  abrirFolha(`
    ${cabecalho(novo ? 'Nova receita' : 'Editar receita')}
    <div class="fields">
      <div class="field full"><label for="r-fonte">De onde veio</label><input id="r-fonte" name="fonte" value="${esc(r.fonte)}" list="lista-fontes" required autocomplete="off">
        <datalist id="lista-fontes">${[...new Set(db.receitas.map(x => x.fonte))].map(f => `<option value="${esc(f)}">`).join('')}</datalist></div>
      <div class="field"><label for="r-valor">Valor (R$)</label><input id="r-valor" class="big num" name="valor" inputmode="decimal" value="${valorInput(r.valor)}" required autofocus></div>
      <div class="field"><label for="r-comp">Mês</label><input id="r-comp" type="month" name="comp" value="${r.comp}" required></div>
      <div class="field full"><label for="r-obs">Observação</label><input id="r-obs" name="obs" value="${esc(r.obs)}" placeholder="Opcional"></div>
    </div>
    ${novo ? '' : confirmaApagar('esta receita')}
    <div class="sheet-actions">
      ${novo ? '<span></span>' : '<button type="button" class="btn danger" data-sheet="apagar">Apagar</button>'}
      <div class="btn-row"><button class="btn" value="cancel">Cancelar</button><button class="btn primary" value="ok">Salvar</button></div>
    </div>`, fd => {
    const valor = parseValor(fd.get('valor'));
    if (!isFinite(valor) || valor <= 0) return erro('valor', 'Digite um valor, ex.: 4.500,00');
    const dados = { fonte: String(fd.get('fonte')).trim() || 'Salário', valor, comp: fd.get('comp') || mes, obs: String(fd.get('obs')).trim() };
    mudar(() => { if (novo) db.receitas.push({ id: uid('r'), ...dados }); else Object.assign(db.receitas.find(x => x.id === r.id), dados); }, novo ? 'Receita adicionada' : 'Receita salva');
  });
}

function formAssinatura(a) {
  const novo = !a;
  a = a || { servico: '', preco: '', periodo: 'Mensal', proxima: '', situacao: 'Ativo', obs: '' };
  apagarAtual = novo ? null : () => mudar(() => { db.assinaturas = db.assinaturas.filter(x => x.id !== a.id); }, 'Assinatura apagada');
  abrirFolha(`
    ${cabecalho(novo ? 'Nova assinatura' : 'Editar assinatura')}
    <div class="fields">
      <div class="field full"><label for="a-serv">Serviço</label><input id="a-serv" name="servico" value="${esc(a.servico)}" required autofocus placeholder="Ex.: Netflix, Google One"></div>
      <div class="field"><label for="a-preco">Preço por cobrança</label><input id="a-preco" class="big num" name="preco" inputmode="decimal" value="${valorInput(a.preco)}" required></div>
      <div class="field"><label for="a-per">Cobra a cada</label><select id="a-per" name="periodo">${Object.keys(PERIODOS).map(p => `<option ${p === a.periodo ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      <div class="field"><label for="a-prox">Próxima renovação</label><input id="a-prox" type="date" name="proxima" value="${a.proxima || ''}"></div>
      <div class="field"><label for="a-sit">Situação</label><select id="a-sit" name="situacao">${SIT_ASS.map(s => `<option ${s === a.situacao ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field full"><label for="a-obs">Observação</label><input id="a-obs" name="obs" value="${esc(a.obs)}" placeholder="Opcional — ex.: plano 200 GB"></div>
    </div>
    ${novo ? '' : confirmaApagar('esta assinatura')}
    <div class="sheet-actions">
      ${novo ? '<span></span>' : '<button type="button" class="btn danger" data-sheet="apagar">Apagar</button>'}
      <div class="btn-row"><button class="btn" value="cancel">Cancelar</button><button class="btn primary" value="ok">Salvar</button></div>
    </div>`, fd => {
    const preco = parseValor(fd.get('preco'));
    const servico = String(fd.get('servico')).trim();
    if (!servico) return erro('servico', 'Diga qual é o serviço.');
    if (!isFinite(preco) || preco < 0) return erro('preco', 'Digite um valor, ex.: 12,50');
    const dados = { servico, preco, periodo: fd.get('periodo'), proxima: fd.get('proxima') || null, situacao: fd.get('situacao'), obs: String(fd.get('obs')).trim() };
    mudar(() => { if (novo) db.assinaturas.push({ id: uid('a'), ...dados }); else Object.assign(db.assinaturas.find(x => x.id === a.id), dados); }, novo ? 'Assinatura adicionada' : 'Assinatura salva');
  });
}

function formCategoria() {
  abrirFolha(`${cabecalho('Nova categoria')}
    <div class="field"><label for="c-nome">Nome</label><input id="c-nome" name="nome" required autofocus placeholder="Ex.: Mercado, Saúde"></div>
    <div class="sheet-actions"><span></span><div class="btn-row"><button class="btn" value="cancel">Cancelar</button><button class="btn primary" value="ok">Adicionar</button></div></div>`, fd => {
    const nome = String(fd.get('nome')).trim();
    if (!nome) return erro('nome', 'Digite um nome.');
    if (db.categorias.includes(nome)) return erro('nome', 'Essa categoria já existe.');
    mudar(() => db.categorias.push(nome), 'Categoria criada');
  });
}

function formApagarTudo() {
  abrirFolha(`${cabecalho('Apagar todos os dados?')}
    <p style="margin:0">Isso remove <b>${db.lancamentos.length} contas, ${db.receitas.length} receitas e ${db.assinaturas.length} assinaturas</b> deste navegador. Só dá para recuperar com um backup.</p>
    <div class="field"><label for="x-conf">Para confirmar, digite APAGAR</label><input id="x-conf" name="conf" autocomplete="off"></div>
    <div class="sheet-actions"><span></span><div class="btn-row"><button class="btn" value="cancel">Cancelar</button><button class="btn danger" value="ok">Apagar tudo</button></div></div>`, fd => {
    if (String(fd.get('conf')).trim().toUpperCase() !== 'APAGAR') return erro('conf', 'Digite APAGAR para confirmar.');
    db = vazio(); salvar(); desfazer = null; view = 'mes'; render(); toast('Dados apagados');
  });
}

/* ---------- Ações ---------- */
function copiarMesAnterior() {
  const ant = addMes(mes, -1);
  const jaTem = new Set(doMes(mes).map(l => l.item));
  let n = 0;
  mudar(() => {
    doMes(ant).filter(l => l.situacao !== 'Cancelado' && !jaTem.has(l.item)).forEach(l => {
      let parcela = l.parcela || '';
      const m = parcela.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (m) { if (+m[1] >= +m[2]) return; parcela = `${+m[1] + 1}/${m[2]}`; }
      if (l.situacao === 'Quitado') return;
      db.lancamentos.push({ id: uid('l'), comp: mes, item: l.item, cat: l.cat, parcela, valor: l.valor, situacao: 'Pendente', venc: addMesData(l.venc, 1), pago: null, obs: '' });
      n++;
    });
    if (!recDoMes(mes).length) recDoMes(ant).forEach(r => db.receitas.push({ id: uid('r'), comp: mes, fonte: r.fonte, valor: r.valor, obs: '' }));
  }, null);
  toast(n ? `${n} contas copiadas como pendentes — ajuste os valores quando a fatura chegar` : 'Nada novo para copiar', !!n);
}
function alternarPago(id) {
  const l = db.lancamentos.find(x => x.id === id); if (!l) return;
  mudar(() => {
    if (ehPago(l)) { l.situacao = 'Pendente'; l.pago = null; }
    else { l.situacao = 'Pago'; l.pago = l.pago || hoje(); }
  }, ehPago(l) ? `“${l.item}” voltou para pendente` : `“${l.item}” marcada como paga`);
}

function exportar() {
  db.ultimoBackup = new Date().toISOString(); salvar();
  const dados = { app: 'controle-gastos', versao: 1, exportado: db.ultimoBackup, ...db };
  const blob = new Blob([JSON.stringify(dados, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Controle de Gastos - backup ${hoje()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  render(); toast('Backup exportado para a pasta Downloads');
}
$('#fileInput').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.lancamentos)) throw new Error('formato');
    mudar(() => {
      db = Object.assign(vazio(), {
        lancamentos: d.lancamentos, receitas: d.receitas || [], assinaturas: d.assinaturas || [],
        itens: d.itens || {}, categorias: d.categorias?.length ? d.categorias : [...CATS_PADRAO], ultimoBackup: d.ultimoBackup || null, iniciado: true,
      });
      db.lancamentos.forEach(l => { if (l.cat && !db.categorias.includes(l.cat)) db.categorias.push(l.cat); if (!db.itens[l.item]) db.itens[l.item] = l.cat; });
    }, `Importado: ${d.lancamentos.length} contas e ${(d.receitas || []).length} receitas`);
  } catch (err) { toast('Esse arquivo não é um backup do Controle de Gastos.'); }
});

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const id = t.dataset.id;
  switch (t.dataset.act) {
    case 'toggle': alternarPago(id); break;
    case 'editar-conta': formConta(db.lancamentos.find(x => x.id === id)); break;
    case 'editar-receita': formReceita(db.receitas.find(x => x.id === id)); break;
    case 'editar-assinatura': formAssinatura(db.assinaturas.find(x => x.id === id)); break;
    case 'nova-conta': formConta(); break;
    case 'nova-receita': formReceita(); break;
    case 'nova-assinatura': formAssinatura(); break;
    case 'nova-categoria': formCategoria(); break;
    case 'copiar': copiarMesAnterior(); break;
    case 'irmes': mes = t.dataset.mes; view = 'mes'; render(); scrollTo({ top: 0 }); break;
    case 'ano': anoHist = t.dataset.ano; render(); break;
    case 'exportar': exportar(); break;
    case 'importar': $('#fileInput').click(); break;
    case 'comecar': db.iniciado = true; salvar(); render(); break;
    case 'entrar': nuvem.entrar(); break;
    case 'sair': nuvem.sair(); break;
    case 'sync': if (nuvem.usuario) { view = 'ajustes'; render(); } else nuvem.entrar(); break;
    case 'apagar-tudo': formApagarTudo(); break;
  }
});
document.addEventListener('change', e => {
  const s = e.target.closest('select[data-item]'); if (!s) return;
  const item = s.dataset.item, cat = s.value;
  mudar(() => { db.itens[item] = cat; db.lancamentos.forEach(l => { if (l.item === item) l.cat = cat; }); }, `${item} agora é “${cat}”`);
});
document.addEventListener('input', e => {
  if (e.target.id !== 'busca') return;
  busca = e.target.value;
  const pos = e.target.selectionStart;
  render();
  const el = $('#busca'); el.focus(); el.setSelectionRange(pos, pos);
});

$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; view = b.dataset.view; render(); scrollTo({ top: 0 }); });
$('#prevMonth').addEventListener('click', () => { mes = addMes(mes, -1); render(); });
$('#nextMonth').addEventListener('click', () => { mes = addMes(mes, 1); render(); });
$('#monthLabel').addEventListener('click', () => { mes = mesAtual(); render(); });
$('#fab').addEventListener('click', () => view === 'assinaturas' ? formAssinatura() : formConta());
document.addEventListener('keydown', e => {
  if (sheet.open || e.target.matches('input, textarea, select')) return;
  if (view === 'mes' && e.key === 'ArrowLeft') { mes = addMes(mes, -1); render(); }
  if (view === 'mes' && e.key === 'ArrowRight') { mes = addMes(mes, 1); render(); }
});

/* Toast com “Desfazer” */
let toastTimer;
function toast(msg, comDesfazer) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${comDesfazer && desfazer ? '<button id="undo">Desfazer</button>' : ''}`;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4500);
  const u = $('#undo');
  if (u) u.onclick = () => { db = JSON.parse(desfazer); desfazer = null; salvar(); render(); el.classList.remove('show'); };
}

/* Instalação como app */
let promptInstalar = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstalar = e; $('#installBtn').hidden = false; });
$('#installBtn').addEventListener('click', async () => { if (!promptInstalar) return; promptInstalar.prompt(); await promptInstalar.userChoice; promptInstalar = null; $('#installBtn').hidden = true; });
addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('App instalado!'); });
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

nuvem.iniciar();
render();
