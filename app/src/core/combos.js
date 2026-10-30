// ==========================================
// 🥋 COMBOS E FOLLOW UPS (components/combos/*)
//
// Estilo de luta em sequência. Um Combo tem um GOLPE INICIADOR e uma fila FIXA de golpes (1 → 2 → 3...). Quando o personagem usa o
// iniciador e ACERTA, o Combo começa; a cada golpe seguinte que acerta, ele avança. Cada golpe dá BUFFS (os mesmos efeitos que as
// Habilidades/Poderes dão: atributo + propriedade + valor) que se SOMAM aos dos golpes anteriores e valem enquanto durar o combate.
// Ao concluir o Combo, o personagem mantém todos os buffs (no máximo) e pode fazer outros Combos para somar mais.
//
// Follow Ups são golpes que podem ser usados dentro de um Combo (ou a qualquer momento) e fora do turno, pagando Reação, Ação Bônus
// ou Ação segurada. Têm NÍVEIS de buff que sobem conforme o número de Combos finalizados no combate.
//
// Nada aqui calcula dano: os buffs entram como efeitos de qualquer outra fonte (core/attributes.js > getEfeitosDeClasse), então o
// dano, o acerto, a CA, as Ações e as reduções seguem a mesma engine de sempre. Quem não cria Combos não sente nenhuma diferença.
//
// Onde fica na ficha (Firebase):
//   ficha.combos[]               definições (Combo)
//   ficha.followUps[]            definições (FollowUp)
//   ficha.combate.comboEstado    onde o personagem está AGORA (zera ao fim do combate)
// Este módulo é puro e não importa nada além de efeitos-constants (attributes.js importa este arquivo).
// ==========================================
import { ATRIBUTOS_AGRUPADOS, getPropriedadesDoAtributo } from './efeitos-constants.js';

export const TIPOS_GOLPE = [
    { id: 'livre', rotulo: 'Golpe livre' },
    { id: 'arma', rotulo: 'Golpe com Arma' },
    { id: 'habilidade', rotulo: 'Habilidade / Poder' },
    { id: 'tecnica', rotulo: 'Técnica Elemental' },
    { id: 'magia', rotulo: 'Magia' }
];
export const ACOES_GOLPE = [
    { id: 'padrao', rotulo: 'Ação' },
    { id: 'bonus', rotulo: 'Ação Bônus' },
    { id: 'reacao', rotulo: 'Reação' }
];
export const QUANDO_FOLLOW_UP = [
    { id: 'combo', rotulo: 'Só durante um Combo' },
    { id: 'qualquer', rotulo: 'A qualquer momento do combate' }
];
export const ATRIBUTOS_BUFF = ATRIBUTOS_AGRUPADOS.flatMap(g => g.options);

export const LIMITES = { nome: 60, descricao: 400, passos: 12, combos: 30, followUps: 20, buffs: 12, niveis: 8 };
export const VERSAO_EXPORTACAO = 1;
export const TIPO_EXPORTACAO = 'rpg-combos';

const NOME_ACAO = Object.fromEntries(ACOES_GOLPE.map(a => [a.id, a.rotulo]));
const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const numero = (v, padrao = 0) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : padrao; };
const inteiro = (v, padrao = 0) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? n : padrao; };
const idValido = (v) => /^[A-Za-z0-9_-]{1,40}$/.test(String(v ?? '')) && !(String(v) in Object.prototype);

let contadorId = 0;
export function gerarId(prefixo = 'c', agora = Date.now()) {
    contadorId = (contadorId + 1) % 1296;
    return `${prefixo}${agora.toString(36)}${contadorId.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export const rotuloAcaoGolpe = (id) => NOME_ACAO[id] || NOME_ACAO.padrao;

// ---------- Buffs (efeitos) ----------

// { nome, atributo, propriedade, valor } válido ou null. A propriedade cai numa opção válida para o atributo.
export function normalizarBuff(e) {
    if (!e || typeof e !== 'object') return null;
    const atributo = String(e.atributo ?? '').trim().toLowerCase() === 'energiaesp' ? 'energiaEsp' : String(e.atributo ?? '').trim();
    if (!ATRIBUTOS_BUFF.includes(atributo)) return null;
    const permitidas = getPropriedadesDoAtributo(atributo);
    const prop = String(e.propriedade ?? '').trim();
    const propriedade = permitidas.includes(prop) ? prop : permitidas[0];
    const bruto = numero(e.valor, NaN);
    if (!Number.isFinite(bruto)) return null;
    return { nome: texto(e.nome, LIMITES.nome), atributo, propriedade, valor: Math.round(bruto * 1000) / 1000 };
}

function normalizarBuffs(lista) {
    return (Array.isArray(lista) ? lista : []).map(normalizarBuff).filter(Boolean).slice(0, LIMITES.buffs);
}

export function descreverBuff(b) {
    if (!b) return '';
    const sinal = b.valor > 0 ? '+' : '';
    const mult = String(b.propriedade).startsWith('m');
    return `${String(b.atributo).replace(/_/g, ' ')} (${b.propriedade}) ${sinal}${b.valor}${mult ? 'x' : ''}`;
}

// ---------- Golpes, Combos e Follow Ups ----------

export function normalizarGolpe(g) {
    const bruto = g && typeof g === 'object' ? g : {};
    return {
        nome: texto(bruto.nome, LIMITES.nome),
        tipo: TIPOS_GOLPE.some(t => t.id === bruto.tipo) ? bruto.tipo : 'livre',
        refId: bruto.refId !== undefined && bruto.refId !== null && bruto.refId !== '' ? String(bruto.refId).slice(0, 80) : '',
        acao: ACOES_GOLPE.some(a => a.id === bruto.acao) ? bruto.acao : 'padrao',
        descricao: texto(bruto.descricao, LIMITES.descricao),
        buffs: normalizarBuffs(bruto.buffs)
    };
}

export function normalizarCombo(c) {
    const bruto = c && typeof c === 'object' ? c : {};
    return {
        id: idValido(bruto.id) ? String(bruto.id) : gerarId('c'),
        nome: texto(bruto.nome, LIMITES.nome),
        descricao: texto(bruto.descricao, LIMITES.descricao),
        iniciador: normalizarGolpe(bruto.iniciador),
        passos: (Array.isArray(bruto.passos) ? bruto.passos : []).slice(0, LIMITES.passos).map(normalizarGolpe)
    };
}

export function normalizarFollowUp(f) {
    const bruto = f && typeof f === 'object' ? f : {};
    const { buffs: ignorados, ...golpe } = normalizarGolpe(bruto);
    const niveis = (Array.isArray(bruto.niveis) ? bruto.niveis : []).slice(0, LIMITES.niveis).map((n) => ({
        combos: Math.max(0, inteiro(n && n.combos)),
        descricao: texto(n && n.descricao, LIMITES.descricao),
        buffs: normalizarBuffs(n && n.buffs)
    })).sort((a, b) => a.combos - b.combos);
    const permitidas = (Array.isArray(bruto.acoesPermitidas) ? bruto.acoesPermitidas : []).filter((a, i, l) => ACOES_GOLPE.some(x => x.id === a) && l.indexOf(a) === i);
    return {
        id: idValido(bruto.id) ? String(bruto.id) : gerarId('f'),
        ...golpe,
        quando: QUANDO_FOLLOW_UP.some(q => q.id === bruto.quando) ? bruto.quando : 'combo',
        combosIds: (Array.isArray(bruto.combosIds) ? bruto.combosIds : []).filter(idValido).map(String),
        acoesPermitidas: permitidas.length > 0 ? permitidas : [golpe.acao],
        niveis: niveis.length > 0 ? niveis : [{ combos: 0, descricao: '', buffs: [] }]
    };
}

// Ids repetidos (importação, edição) ganham um novo; assim cada item é endereçável sem ambiguidade.
function idsUnicos(lista, prefixo) {
    const vistos = new Set();
    return lista.map((item, i) => {
        const id = vistos.has(item.id) ? `${prefixo}_dup${i}` : item.id;
        vistos.add(id);
        return id === item.id ? item : { ...item, id };
    });
}

// Item vindo do banco sem id válido recebe um id fixo pela posição: gerar um novo a cada leitura soltaria o estado do Combo (comboId).
const comIdEstavel = (lista, prefixo, limite) => lista.slice(0, limite).map((x, i) => (x && typeof x === 'object' && !idValido(x.id) ? { ...x, id: `${prefixo}_i${i}` } : x));

export function combosDaFicha(ficha) {
    return idsUnicos(comIdEstavel(Array.isArray(ficha?.combos) ? ficha.combos : [], 'c', LIMITES.combos).map(normalizarCombo), 'c');
}

export function followUpsDaFicha(ficha) {
    return idsUnicos(comIdEstavel(Array.isArray(ficha?.followUps) ? ficha.followUps : [], 'f', LIMITES.followUps).map(normalizarFollowUp), 'f');
}

// Quem não criou nada não usa o sistema: nenhum aviso aparece para essa pessoa.
export function temCombos(ficha) {
    return (Array.isArray(ficha?.combos) && ficha.combos.length > 0) || (Array.isArray(ficha?.followUps) && ficha.followUps.length > 0);
}

// Todos os golpes de um Combo em ordem (índice 0 = iniciador).
export const golpesDoCombo = (combo) => [combo.iniciador, ...combo.passos];

// ---------- Estado do combate ----------

export function estadoVazio() {
    return { ativo: null, concluidos: [], finalizados: 0, followUps: {}, niveisManuais: {} };
}

export function estadoDeCombo(ficha) {
    const bruto = ficha?.combate?.comboEstado;
    if (!bruto || typeof bruto !== 'object') return estadoVazio();
    const ativo = bruto.ativo && idValido(bruto.ativo.comboId) ? { comboId: String(bruto.ativo.comboId), passo: Math.max(0, inteiro(bruto.ativo.passo)) } : null;
    const ativoValido = ativo && combosDaFicha(ficha).some(c => c.id === ativo.comboId) ? ativo : null;
    const followUps = {};
    Object.entries(bruto.followUps && typeof bruto.followUps === 'object' ? bruto.followUps : {}).forEach(([id, v]) => {
        if (idValido(id) && v) followUps[id] = { usos: Math.max(0, inteiro(v.usos)), ativo: v.ativo === true };
    });
    const niveisManuais = {};
    Object.entries(bruto.niveisManuais && typeof bruto.niveisManuais === 'object' ? bruto.niveisManuais : {}).forEach(([id, v]) => {
        if (idValido(id)) niveisManuais[id] = inteiro(v);
    });
    return {
        ativo: ativoValido,
        concluidos: (Array.isArray(bruto.concluidos) ? bruto.concluidos : []).filter(idValido).map(String).filter((id, i, l) => l.indexOf(id) === i),
        finalizados: Math.max(0, inteiro(bruto.finalizados)),
        followUps,
        niveisManuais
    };
}

// Fim do combate: tudo volta ao começo (a definição dos Combos continua na ficha).
export const zerarEstadoDeCombo = () => estadoVazio();

function concluir(estado, combo) {
    return {
        ...estado,
        ativo: null,
        concluidos: estado.concluidos.includes(combo.id) ? estado.concluidos : [...estado.concluidos, combo.id],
        finalizados: estado.finalizados + 1
    };
}

// O iniciador acertou: o Combo começa (os buffs do iniciador já valem). Combo só com o iniciador conclui na hora.
export function iniciarCombo(estado, combo) {
    if (!combo || estado.ativo) return estado;
    const novo = { ...estado, ativo: { comboId: combo.id, passo: 0 } };
    return combo.passos.length === 0 ? concluir(novo, combo) : novo;
}

// O próximo golpe acertou: avança; no último golpe o Combo é concluído.
export function avancarCombo(estado, combo) {
    if (!combo || !estado.ativo || estado.ativo.comboId !== combo.id) return estado;
    const passo = estado.ativo.passo + 1;
    if (passo >= combo.passos.length) return concluir(estado, combo);
    return { ...estado, ativo: { comboId: combo.id, passo } };
}

// Quebrou o Combo (errou, foi interrompido...): os buffs do Combo em andamento se perdem; o que já foi concluído fica.
export function interromperCombo(estado) {
    return estado.ativo ? { ...estado, ativo: null } : estado;
}

export function usarFollowUp(estado, followUp) {
    if (!followUp) return estado;
    const atual = estado.followUps[followUp.id] || { usos: 0, ativo: false };
    return { ...estado, followUps: { ...estado.followUps, [followUp.id]: { usos: atual.usos + 1, ativo: true } } };
}

export function ajustarNivelFollowUp(estado, followUpId, delta) {
    return { ...estado, niveisManuais: { ...estado.niveisManuais, [followUpId]: inteiro(estado.niveisManuais[followUpId]) + inteiro(delta) } };
}

// Nível (índice 0...) do Follow Up agora: o mais alto cujo número de Combos finalizados já foi atingido, mais o ajuste manual.
export function nivelDoFollowUp(followUp, estado) {
    if (!followUp || followUp.niveis.length === 0) return 0;
    let nivel = 0;
    followUp.niveis.forEach((n, i) => { if (estado.finalizados >= n.combos) nivel = i; });
    return Math.max(0, Math.min(followUp.niveis.length - 1, nivel + inteiro(estado.niveisManuais[followUp.id])));
}

// ---------- O que o jogador pode escolher agora ----------

export function proximoGolpeDoCombo(ficha) {
    const estado = estadoDeCombo(ficha);
    if (!estado.ativo) return null;
    const combo = combosDaFicha(ficha).find(c => c.id === estado.ativo.comboId);
    if (!combo) return null;
    const indice = estado.ativo.passo + 1;
    const golpe = golpesDoCombo(combo)[indice];
    if (!golpe) return null;
    return { combo, indice, golpe, ultimo: indice === golpesDoCombo(combo).length - 1 };
}

// { iniciadores, proximo, followUps }: tudo que faz sentido oferecer depois de um golpe que acertou.
export function opcoesDeCombo(ficha) {
    const estado = estadoDeCombo(ficha);
    const combos = combosDaFicha(ficha);
    const iniciadores = estado.ativo ? [] : combos.filter(c => c.iniciador.nome).map(c => ({ combo: c, golpe: c.iniciador }));
    const proximo = proximoGolpeDoCombo(ficha);
    const followUps = followUpsDaFicha(ficha)
        .filter((f) => {
            if (f.quando === 'qualquer') return true;
            if (!estado.ativo) return false;
            return f.combosIds.length === 0 || f.combosIds.includes(estado.ativo.comboId);
        })
        .map((f) => ({ followUp: f, nivel: nivelDoFollowUp(f, estado) }));
    return { iniciadores, proximo, followUps };
}

// ---------- Efeitos para a engine ----------

const comOrigem = (buffs, nome) => buffs.map(b => ({ ...b, nome: b.nome ? `${nome}: ${b.nome}` : nome, origem: 'combo' }));

// Buffs que valem agora: Combos concluídos (tudo), o Combo em andamento (até o golpe atual) e Follow Ups já usados (no nível atual).
// Entram na engine como os efeitos de uma Habilidade (atributo/propriedade/valor), então tudo que lê efeitos enxerga o Combo.
export function efeitosDeCombos(ficha) {
    if (!ficha || !temCombos(ficha)) return [];
    const estado = estadoDeCombo(ficha);
    const combos = combosDaFicha(ficha);
    const saida = [];
    estado.concluidos.forEach((id) => {
        const combo = combos.find(c => c.id === id);
        if (combo) golpesDoCombo(combo).forEach(g => saida.push(...comOrigem(g.buffs, `Combo ${combo.nome || 'sem nome'} › ${g.nome || 'golpe'}`)));
    });
    if (estado.ativo && !estado.concluidos.includes(estado.ativo.comboId)) {
        const combo = combos.find(c => c.id === estado.ativo.comboId);
        if (combo) golpesDoCombo(combo).slice(0, estado.ativo.passo + 1).forEach(g => saida.push(...comOrigem(g.buffs, `Combo ${combo.nome || 'sem nome'} › ${g.nome || 'golpe'}`)));
    }
    followUpsDaFicha(ficha).forEach((f) => {
        if (!(estado.followUps[f.id] && estado.followUps[f.id].ativo)) return;
        const nivel = f.niveis[nivelDoFollowUp(f, estado)];
        if (nivel) saida.push(...comOrigem(nivel.buffs, `Follow Up ${f.nome || 'sem nome'}`));
    });
    return saida;
}

// ---------- Exportar / importar ----------

export function exportarCombos(ficha) {
    return { tipo: TIPO_EXPORTACAO, versao: VERSAO_EXPORTACAO, combos: combosDaFicha(ficha), followUps: followUpsDaFicha(ficha) };
}

// Aceita o objeto exportado ou o texto JSON (inclusive dentro de um bloco ```json). Devolve { combos, followUps, avisos } já
// normalizados, com ids novos (nada colide com o que a ficha já tem) e os follow ups ligados aos novos ids dos Combos.
export function importarCombos(entrada, existentesBruto = {}) {
    const existentes = existentesBruto && typeof existentesBruto === 'object' ? existentesBruto : {};
    let dados = entrada;
    if (typeof entrada === 'string') {
        const limpo = entrada.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        try { dados = JSON.parse(limpo); } catch (e) { return { combos: [], followUps: [], avisos: ['O texto não é um JSON válido.'] }; }
    }
    if (Array.isArray(dados)) dados = { combos: dados };
    if (!dados || typeof dados !== 'object') return { combos: [], followUps: [], avisos: ['Nada para importar.'] };

    const avisos = [];
    const idsAntigos = new Map();
    const combos = (Array.isArray(dados.combos) ? dados.combos : []).slice(0, LIMITES.combos).map((bruto) => {
        const c = normalizarCombo({ ...bruto, id: undefined });
        if (bruto && bruto.id !== undefined) idsAntigos.set(String(bruto.id), c.id);
        if (!c.nome) avisos.push('Um Combo sem nome foi importado como "Combo sem nome".');
        if (!c.nome) c.nome = 'Combo sem nome';
        if (!c.iniciador.nome) avisos.push(`Combo "${c.nome}": o iniciador está sem nome.`);
        if (c.passos.length === 0) avisos.push(`Combo "${c.nome}": não tem golpes depois do iniciador.`);
        return c;
    });
    const followUps = (Array.isArray(dados.followUps) ? dados.followUps : []).slice(0, LIMITES.followUps).map((bruto) => {
        const f = normalizarFollowUp({ ...bruto, id: undefined });
        f.combosIds = (Array.isArray(bruto && bruto.combosIds) ? bruto.combosIds : []).map(id => idsAntigos.get(String(id))).filter(Boolean);
        if (!f.nome) { avisos.push('Um Follow Up sem nome foi importado como "Follow Up sem nome".'); f.nome = 'Follow Up sem nome'; }
        return f;
    });
    const usados = new Set([...(existentes.combos || []), ...(existentes.followUps || [])].filter(Boolean).map(x => x.id));
    const colisao = [...combos, ...followUps].some(x => usados.has(x.id));
    if (colisao) avisos.push('Alguns ids já existiam e foram trocados.');
    return { combos, followUps, avisos };
}

// Texto curto para o feed.
export function resumirCombo(combo) {
    if (!combo) return '';
    return golpesDoCombo(combo).map(g => g.nome || 'golpe').join(' → ');
}
