// ==========================================
// 🔁 DEFLEXÃO — reação OFERECIDA (nunca automática) "re-rolar o ataque que errou": quando um ataque contra o defensor ERRA e ele tem a reação
// `rerolar_ataque` (core/reacoes.js), o MESMO ataque é rolado de novo contra a CA do PRÓPRIO ATACANTE, usando o bônus de acerto gravado no feed do golpe
// (`acertoBonus` + `acertoDados`, core/engine.js > calcularAcerto). Se acertar, o dano ORIGINAL do golpe volta ao atacante, pelo mesmo caminho do Reflexo
// (core/reflexo.js): o cliente do DEFENSOR grava o dano no atacante (services/deflexao.js); o atacante não precisa estar online.
//   • A re-rolagem é um ataque SIMPLES: 1 rolagem do dado gravado + bônus, sem vantagem/desvantagem e sem Diferença de Poder (documentado também no aviso ao usar).
//   • O Dano só é aplicado se a entrada `dano` do atacante trouxer `golpeAcertoTs` igual ao ts do acerto que errou (AtaqueFormContext grava). Aplicação AT-MOST-ONCE:
//     o estado `aplicada` é gravado no Firebase ANTES do dano; F5 não reaplica; duas abas só duplicam se ambas consumirem antes do Firebase sincronizar (limitação residual).
//   • O defensor só consegue o dano quando o atacante o rola (entrada `dano` do feed, depois do acerto): enquanto isso a Deflexão fica PENDENTE na ficha
//     do defensor (combate.deflexoes) e expira em VALIDADE_DEFLEXAO_MS.
//   • Idempotência: uma Deflexão por golpe (chave = ts|atacante do feed do acerto), guardada na ficha do defensor ANTES de gastar a Reação; o dano de cada
//     Deflexão é aplicado no máximo uma vez (estado pendente -> aplicada). Duas abas do mesmo jogador só divergem se o Firebase ainda não sincronizou.
//   • Falha fechada: atacante ausente/ambíguo, sem CA válida ou golpe sem bônus gravado = nada acontece e a Reação NÃO é gasta.
//   • NÃO redireciona o ataque a terceiros (fora de escopo). A rolagem é um único ataque simples (sem vantagem/desvantagem/Poder).
// ==========================================
import { montarAlvoPersonagem } from './alvoCombate.js';

export const VALIDADE_DEFLEXAO_MS = 10 * 60 * 1000;
export const MEMORIA_DEFLEXAO_MS = 60 * 60 * 1000;
export const LIMITE_DEFLEXOES_GUARDADAS = 20;

// Chave do golpe (feed do acerto): ts + atacante. '' se faltar algo.
export const chaveDoGolpe = (f) => (f && f.ts && f.nome ? `${f.ts}|${f.nome}` : '');

// { bonus, qtd, faces } do golpe gravado no feed, ou null (sem bônus gravado = não dá para re-rolar com segurança).
export function dadosParaRerolar(f) {
    if (!f || typeof f !== 'object' || f.acertoBonus === undefined || f.acertoBonus === null || f.acertoBonus === '') return null;
    const bonus = Number(f.acertoBonus);
    if (!Number.isFinite(bonus) || Math.abs(bonus) > 1e12) return null;
    const qtd = f.acertoDados ? Number(f.acertoDados.qtd) : 1;
    const faces = f.acertoDados ? Number(f.acertoDados.faces) : 20;
    if (!Number.isInteger(qtd) || !Number.isInteger(faces) || qtd < 1 || qtd > 20 || faces < 2 || faces > 1000) return null;
    return { bonus, qtd, faces };
}

// Rola o ataque de novo: { soma, total, natural, acertou }. 20 natural acerta e 1 natural erra (só com 1d20), como no acerto normal.
export function rolarDeflexao({ bonus, qtd, faces, defesa }, rng = Math.random) {
    let soma = 0;
    for (let i = 0; i < qtd; i++) soma += Math.floor(rng() * faces) + 1;
    const natural = qtd === 1 && faces === 20 && (soma === 20 || soma === 1) ? soma : null;
    const total = Math.floor(soma + bonus);
    const acertou = natural === 20 ? true : natural === 1 ? false : total >= Number(defesa);
    return { soma, total, natural, acertou };
}

// A CA e o alvo do ATACANTE a partir do snapshot da mesa: { id, alvo, defesa } ou null (ausente, ambíguo ou sem CA válida).
// Personagem: a maior entre Evasiva e Resistência (core/alvoCombate.js); achado pelo nome.
export function resolverAtacanteParaDeflexao(nome, { personagens, divisorPoderMesa } = {}) {
    const n = String(nome ?? '').trim();
    if (!n) return null;
    const ps = personagens || {};
    const chavePj = Object.keys(ps).find(k => k === n) || null;
    if (chavePj && ps[chavePj]) {
        const alvo = montarAlvoPersonagem(chavePj, ps[chavePj], divisorPoderMesa);
        const defesa = alvo ? Number(alvo.valorDefesa) : NaN;
        return alvo && Number.isFinite(defesa) && defesa > 0 ? { id: `pj:${chavePj}`, alvo, defesa } : null;
    }
    return null;
}

// ---------- Registro na ficha do defensor (combate.deflexoes) ----------
const lerLista = (ficha) => (ficha && ficha.combate && Array.isArray(ficha.combate.deflexoes) ? ficha.combate.deflexoes : []);

export const deflexaoJaUsada = (ficha, chave) => !!chave && lerLista(ficha).some(d => d && d.chave === chave);

// Registra a Deflexão deste golpe (muta o rascunho). false se o golpe já teve a sua (idempotência). estado: 'pendente' (acertou, falta o dano) | 'errou'.
export function registrarDeflexao(ficha, { chave, atacante, acertou, golpeTs }, agora = Date.now()) {
    if (!ficha || typeof ficha !== 'object' || !chave) return false;
    if (deflexaoJaUsada(ficha, chave)) return false;
    if (!ficha.combate || typeof ficha.combate !== 'object') ficha.combate = {};
    const vivas = lerLista(ficha).filter(d => d && (agora - (Number(d.criadoEm) || 0)) <= MEMORIA_DEFLEXAO_MS);
    vivas.push({ chave, atacante: String(atacante ?? '').slice(0, 80), golpeTs: Number(golpeTs) || 0, estado: acertou ? 'pendente' : 'errou', criadoEm: agora });
    ficha.combate.deflexoes = vivas.slice(-LIMITE_DEFLEXOES_GUARDADAS);
    return true;
}

// Deflexões que acertaram e ainda esperam o dano do golpe (e não venceram).
export function deflexoesPendentes(ficha, agora = Date.now()) {
    return lerLista(ficha).filter(d => d && d.estado === 'pendente' && (agora - (Number(d.criadoEm) || 0)) <= VALIDADE_DEFLEXAO_MS);
}

// Marca a Deflexão como aplicada (muta o rascunho). true só se ela ainda estava pendente (quem recebe true é quem aplica o dano).
export function consumirDeflexaoPendente(ficha, chave, agora = Date.now()) {
    const d = lerLista(ficha).find(x => x && x.chave === chave && x.estado === 'pendente');
    if (!d || (agora - (Number(d.criadoEm) || 0)) > VALIDADE_DEFLEXAO_MS) return false;
    d.estado = 'aplicada';
    return true;
}

// ts do último acerto de `nome` no feed (o Dano do atacante grava isso em `golpeAcertoTs` para ficar LIGADO ao golpe que errou). 0 se não houver.
export function ultimoAcertoTs(feed, nome) {
    let ts = 0;
    (Array.isArray(feed) ? feed : []).forEach((f) => { if (f && f.tipo === 'acerto' && f.nome === nome && Number(f.ts) > ts) ts = Number(f.ts); });
    return ts;
}

// A entrada `dano` do feed que pertence ao golpe da Deflexão: a do atacante cujo `golpeAcertoTs` é EXATAMENTE o ts do acerto que errou (ligação explícita).
// Dano sem essa marca (feed antigo, Dano livre) NÃO é aplicado: sem ligação clara não se devolve nada. null se ainda não veio.
export function acharDanoDoGolpe(feed, deflexao) {
    if (!deflexao || !Array.isArray(feed) || !(Number(deflexao.golpeTs) > 0)) return null;
    let achado = null;
    feed.forEach((f) => {
        if (!f || f.tipo !== 'dano' || f.nome !== deflexao.atacante) return;
        if (Number(f.golpeAcertoTs) !== Number(deflexao.golpeTs)) return;
        if (!(Number(f.dano) > 0)) return;
        if (!achado || Number(f.ts) < Number(achado.ts)) achado = f;
    });
    return achado;
}

// Deflexões que acertaram mas venceram sem o Dano do golpe (para avisar o defensor).
export function deflexoesExpiradas(ficha, agora = Date.now()) {
    return lerLista(ficha).filter(d => d && d.estado === 'pendente' && (agora - (Number(d.criadoEm) || 0)) > VALIDADE_DEFLEXAO_MS);
}

// Marca como expirada (muta o rascunho). true se estava pendente e vencida (quem recebe true avisa).
export function expirarDeflexao(ficha, chave, agora = Date.now()) {
    const d = lerLista(ficha).find(x => x && x.chave === chave && x.estado === 'pendente');
    if (!d || (agora - (Number(d.criadoEm) || 0)) <= VALIDADE_DEFLEXAO_MS) return false;
    d.estado = 'expirada';
    return true;
}
