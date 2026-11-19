// ==========================================
// 🥋 OFERTA DE FOLLOW UP (FUA oferecido) — lógica pura. Um gatilho com a ação `oferecerFollowUp` (core/gatilhos.js) NÃO rola nada: guarda uma OFERTA
// na ficha do dono; o aviso do Follow Up (components/combos/ComboPrompt.jsx) a mostra SÓ no cliente do dono, que aceita (escolhe a Ação a pagar e rola o
// golpe como sempre) ou recusa. Mestre, NPCs e clones nunca são consultados.
//   ficha.combate.ofertasFollowUp = [{ id, followUpId, gatilho, custoReducaoPct?, naoGeraOutro?, ts }]   (no máx. LIMITE_OFERTAS; a mais antiga sai)
//   ficha.combate.semEncadeioFollowUp = ts   (FUA aceito com `naoGeraOutro`: até o fim do golpe que acertar (e dos reusos dele), nenhum oferecerFollowUp dispara; vale OFERTA_VALIDADE_MS)
//   ficha.combate.reducaoCustoFollowUp = { pct, ts }   (custo reduzido do próximo golpe: lido SÓ no cálculo do dano desse golpe (fichaComReducaoDeCusto), nunca vira buff, então não vaza para defesa/outros gastos)
// Dono offline: a oferta fica guardada na ficha e vale até o próximo início do turno dele, o fim da luta ou OFERTA_VALIDADE_MS.
// Custo reduzido: ao aceitar, guarda `reducaoCustoFollowUp`; o próximo golpe do dono o consome (também quando a Reação consome o golpe) e ele expira no início do turno, no fim da luta ou na validade.
// Corrida entre clientes: o registro da oferta muda a lista dentro do produtor da ficha MAIS RECENTE (merge por id); só uma gravação de campo inteiro vinda de outro cliente com cópia antiga poderia sobrescrevê-la (limitação aceita).
// ==========================================
import { followUpsDaFicha } from './combos.js';

export const LIMITE_OFERTAS = 5;
export const OFERTA_VALIDADE_MS = 30 * 60 * 1000;
export const ENERGIAS_DO_CUSTO = ['mana', 'aura', 'chakra', 'corpo'];
export const NOME_BUFF_CUSTO_FUA = 'Custo reduzido (Follow Up)';
export const CAMINHO_OFERTAS = 'combate/ofertasFollowUp';
export const CAMINHO_SEM_ENCADEIO = 'combate/semEncadeioFollowUp';
export const CAMINHO_REDUCAO_CUSTO = 'combate/reducaoCustoFollowUp';

const semAcento = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Follow Up da ficha por id; se não houver, pelo nome (sem acento/maiúsculas). null se não existe.
export function localizarFollowUp(ficha, referencia) {
    const lista = followUpsDaFicha(ficha);
    const ref = String(referencia ?? '').trim();
    if (!ref) return null;
    return lista.find(f => f.id === ref) || lista.find(f => semAcento(f.nome) === semAcento(ref)) || null;
}

const ofertasBrutas = (ficha) => (ficha && ficha.combate && Array.isArray(ficha.combate.ofertasFollowUp) ? ficha.combate.ofertasFollowUp : []);

// Ofertas ainda válidas e bem formadas (para a tela). Não muda a ficha.
export function ofertasValidas(ficha, agora = Date.now()) {
    return ofertasBrutas(ficha)
        .filter(o => o && typeof o === 'object' && o.id && o.followUpId && Number.isFinite(Number(o.ts)) && agora - Number(o.ts) <= OFERTA_VALIDADE_MS)
        .map(o => ({ id: String(o.id), followUpId: String(o.followUpId), gatilho: String(o.gatilho || 'Gatilho'), ts: Number(o.ts), ...(Number(o.custoReducaoPct) > 0 ? { custoReducaoPct: Math.min(100, Number(o.custoReducaoPct)) } : {}), ...(o.naoGeraOutro === true ? { naoGeraOutro: true } : {}) }));
}

// Registra a oferta NO RASCUNHO (dentro de updateFicha). A mesma origem (gatilho + Follow Up) renova em vez de empilhar.
// `bloqueio`: motivo de não ofertar ('encadeio' = o FUA em andamento não gera outro). Devolve { texto, caminhos }.
export function registrarOfertaFollowUp(ficha, { chave, referencia, custoReducaoPct = 0, naoGeraOutro = false, gatilhoNome = 'Gatilho', agora = Date.now() } = {}) {
    const caminhos = [];
    if (!ficha) return { texto: '', caminhos };
    if (semEncadeioAtivo(ficha, agora)) return { texto: `${gatilhoNome}: este golpe é um Follow Up oferecido e não gera outro`, caminhos };
    const fu = localizarFollowUp(ficha, referencia);
    if (!fu) return { texto: `${gatilhoNome}: Follow Up "${String(referencia).slice(0, 40)}" não existe na ficha, nada foi oferecido`, caminhos };
    if (!ficha.combate) ficha.combate = {};
    const id = `${chave || 'g'}|${fu.id}`;
    const nova = { id, followUpId: fu.id, gatilho: String(gatilhoNome).slice(0, 60), ts: agora, ...(Number(custoReducaoPct) > 0 ? { custoReducaoPct: Math.min(100, Number(custoReducaoPct)) } : {}), ...(naoGeraOutro ? { naoGeraOutro: true } : {}) };
    // Ofertas vencidas saem aqui também (poda), junto com a de mesma origem (renova).
    const restantes = ofertasBrutas(ficha).filter(o => o && o.id !== id && Number.isFinite(Number(o.ts)) && agora - Number(o.ts) <= OFERTA_VALIDADE_MS);
    ficha.combate.ofertasFollowUp = [...restantes, nova].slice(-LIMITE_OFERTAS);
    caminhos.push(CAMINHO_OFERTAS);
    const custo = nova.custoReducaoPct ? (nova.custoReducaoPct >= 100 ? ', sem custo de energia' : `, custo -${nova.custoReducaoPct}%`) : '';
    return { texto: `${gatilhoNome} ofereceu o Follow Up "${fu.nome || 'sem nome'}"${custo}`, caminhos };
}

// Tira uma oferta (aceita ou recusada). Devolve true se mudou algo.
export function removerOfertaFollowUp(ficha, id) {
    const lista = ofertasBrutas(ficha);
    const resto = lista.filter(o => !o || o.id !== id);
    if (resto.length === lista.length) return false;
    if (resto.length > 0) ficha.combate.ofertasFollowUp = resto; else delete ficha.combate.ofertasFollowUp;
    return true;
}

// Fim da luta / início do turno do dono: as ofertas expiram. Devolve true se havia alguma.
export function limparOfertasFollowUp(ficha) {
    if (!ficha || !ficha.combate || ficha.combate.ofertasFollowUp === undefined) return false;
    delete ficha.combate.ofertasFollowUp;
    return true;
}

// A marca "não gera outro" está de pé (e dentro da validade)?
export function semEncadeioAtivo(ficha, agora = Date.now()) {
    const ts = ficha && ficha.combate ? Number(ficha.combate.semEncadeioFollowUp) : NaN;
    return Number.isFinite(ts) && ts > 1 && agora - ts <= OFERTA_VALIDADE_MS;
}

// Marca o FUA aceito com `naoGeraOutro` no rascunho.
export function marcarSemEncadeio(ficha, agora = Date.now()) {
    if (!ficha.combate) ficha.combate = {};
    ficha.combate.semEncadeioFollowUp = agora;
}

// ---- Custo reduzido do próximo golpe ----
export function definirReducaoCusto(ficha, pct, agora = Date.now()) {
    if (!ficha.combate) ficha.combate = {};
    ficha.combate.reducaoCustoFollowUp = { pct: Math.min(100, Math.max(0, Number(pct) || 0)), ts: agora };
}
export function reducaoCustoAtiva(ficha, agora = Date.now()) {
    const r = ficha && ficha.combate ? ficha.combate.reducaoCustoFollowUp : null;
    if (!r || !Number.isFinite(Number(r.ts)) || agora - Number(r.ts) > OFERTA_VALIDADE_MS) return 0;
    return Math.min(100, Math.max(0, Number(r.pct) || 0));
}
export function limparReducaoCusto(ficha) {
    if (!ficha || !ficha.combate || ficha.combate.reducaoCustoFollowUp === undefined) return false;
    delete ficha.combate.reducaoCustoFollowUp;
    return true;
}
// Cópia RASA da ficha com o desconto do Follow Up como efeito, para passar SÓ ao cálculo do dano do golpe (a ficha real não muda).
export function fichaComReducaoDeCusto(ficha, agora = Date.now()) {
    const pct = reducaoCustoAtiva(ficha, agora);
    if (!(pct > 0)) return ficha;
    const buff = { id: 'fua_custo', nome: NOME_BUFF_CUSTO_FUA, fonte: 'Follow Up', efeitos: efeitosDeCustoReduzido(pct), restantes: 0 };
    return { ...ficha, buffsTemporarios: [...(Array.isArray(ficha.buffsTemporarios) ? ficha.buffsTemporarios : []), buff] };
}

// O golpe que acertou (ou errou) fecha a janela "não gera outro". Devolve true se a marca existia.
export function limparSemEncadeio(ficha) {
    if (!ficha || !ficha.combate || ficha.combate.semEncadeioFollowUp === undefined) return false;
    delete ficha.combate.semEncadeioFollowUp;
    return true;
}

// Efeitos do buff de custo (uma entrada de reducaocusto por energia).
export const efeitosDeCustoReduzido = (pct) => ENERGIAS_DO_CUSTO.map(k => ({ atributo: k, propriedade: 'reducaocusto', valor: Math.min(100, Math.max(0, Number(pct) || 0)), nome: NOME_BUFF_CUSTO_FUA }));
