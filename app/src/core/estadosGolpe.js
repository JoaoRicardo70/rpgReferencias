// ==========================================
// 🩸 ESTADOS APLICADOS POR UM GOLPE — lógica pura. Poderes/Habilidades, Técnicas elementais, Itens/Armas, o Ataque livre
// (ficha.ataqueConfig.estadosGolpe) e o tipo da arma podem aplicar estados negativos (core/condicoes.js) a quem for atingido.
// Cada entrada é { id, stacks, teste?: { atributo, cd }, apenasCritico?, duracao? } (duracao = turnos 1 a 99 OU dado 'NdM(+K)' sorteado ao aplicar, ver core/duracaoEstados.js; sem ela o estado é permanente): o alvo pode resistir com um teste de atributo
// (d20 + dezena do atributo contra a CD). Dummies não têm atributos: não testam, o estado entra direto.
// ==========================================
import { ehEstadoValido, MAX_STACKS, nomeDoEstado, iconeDoEstado } from './condicoes.js';
import { getRawBase } from './attributes.js';
import { modificadorDezena } from './utils.js';
import { imuneAoEstado, resisteAoEstado } from './efeitosCondicionais.js';
import { normalizarDuracaoSpec, sortearDuracao, normalizarDuracao, rotuloDuracao, DURACAO_ESTADO_MAX } from './duracaoEstados.js';

export const ATRIBUTOS_TESTE = ['forca', 'destreza', 'constituicao', 'stamina', 'sabedoria', 'inteligencia', 'energiaEsp', 'carisma'];
export const ROTULO_ATRIBUTO = {
    forca: 'Força', destreza: 'Destreza', constituicao: 'Constituição', stamina: 'Stamina',
    sabedoria: 'Sabedoria', inteligencia: 'Inteligência', energiaEsp: 'Energia Esp.', carisma: 'Carisma'
};
export const LIMITES_ESTADOS = { porFonte: 8, cdMax: 60 };

// Arma sem estado próprio: o tipo dela aplica 1 stack em um CRÍTICO (corte/perfuração sangram, pancada deixa Lento).
export const ESTADO_POR_TIPO_ARMA = {
    espada: 'sangrando', machado: 'sangrando', adaga: 'sangrando', foice: 'sangrando', chicote: 'sangrando',
    lanca: 'sangrando', arco: 'sangrando', 'arma de fogo': 'sangrando',
    martelo: 'lento', manopla: 'lento', escudo: 'lento', cajado: 'lento'
};

const semAcento = (t) => String(t || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function normalizarAplicaEstados(lista) {
    if (!Array.isArray(lista)) return [];
    const saida = [];
    lista.forEach((e) => {
        if (!e || !ehEstadoValido(e.id) || saida.length >= LIMITES_ESTADOS.porFonte) return;
        const stacks = Math.max(1, Math.min(MAX_STACKS, Math.floor(Number(e.stacks) || 1)));
        const item = { id: e.id, stacks };
        if (e.teste && ATRIBUTOS_TESTE.includes(e.teste.atributo)) {
            const cd = Math.floor(Number(e.teste.cd));
            if (Number.isFinite(cd) && cd > 0) item.teste = { atributo: e.teste.atributo, cd: Math.min(LIMITES_ESTADOS.cdMax, cd) };
        }
        if (e.apenasCritico) item.apenasCritico = true;
        const duracao = normalizarDuracaoSpec(e.duracao);
        if (duracao !== null) item.duracao = duracao;
        saida.push(item);
    });
    return saida;
}

export function estadoDoTipoDeArma(armaTipo) {
    const id = ESTADO_POR_TIPO_ARMA[semAcento(armaTipo)];
    return id ? { id, stacks: 1, apenasCritico: true } : null;
}

// Junta o que o golpe aplica: `fontes` = poderes/técnicas/itens em uso ({ nome, aplicaEstados }); `armas` = armas equipadas
// (sem estado próprio entram pelo tipo); `extras` = lista do Ataque livre.
export function coletarEstadosDoGolpe({ armas = [], fontes = [], extras = [] } = {}) {
    const saida = [];
    fontes.forEach((f) => { if (f) normalizarAplicaEstados(f.aplicaEstados).forEach(e => saida.push({ ...e, origem: f.nome || '' })); });
    armas.forEach((a) => {
        if (!a) return;
        const proprios = normalizarAplicaEstados(a.aplicaEstados);
        if (proprios.length > 0) proprios.forEach(e => saida.push({ ...e, origem: a.nome || 'arma' }));
        else { const t = estadoDoTipoDeArma(a.armaTipo); if (t) saida.push({ ...t, origem: `${a.nome || 'arma'} (${a.armaTipo})` }); }
    });
    normalizarAplicaEstados(extras).forEach(e => saida.push({ ...e, origem: 'Ataque livre' }));
    return saida;
}

const d20 = () => Math.floor(Math.random() * 20) + 1;

// Resolve o que realmente entra no alvo. `fichaAlvo` = ficha de personagem (null para Dummie: sem teste).
// Devolve { aplicados: [{ id, stacks, origem }], resistidos: [{ id, origem, total, cd, atributo }], pulados: n }.
export function resolverEstadosNoAlvo(estados, fichaAlvo, { critico = false, rolar = d20, rng = Math.random } = {}) {
    const aplicados = []; const resistidos = []; const imunes = []; let pulados = 0;
    (estados || []).forEach((e) => {
        if (!e || !ehEstadoValido(e.id)) return;
        if (e.apenasCritico && !critico) { pulados++; return; }
        // 🛡️ Imunidade por efeito (ex.: imune_surpresa): o estado nem entra, sem teste.
        if (fichaAlvo && imuneAoEstado(fichaAlvo, e.id)) { imunes.push({ id: e.id, origem: e.origem || '' }); return; }
        if (e.teste && fichaAlvo) {
            const dado = resisteAoEstado(fichaAlvo, e.id) ? Math.max(rolar(), rolar()) : rolar();
            const total = dado + modificadorDezena(getRawBase(fichaAlvo, e.teste.atributo));
            if (total >= e.teste.cd) { resistidos.push({ id: e.id, origem: e.origem || '', total, cd: e.teste.cd, atributo: e.teste.atributo }); return; }
        }
        // ⏳ Duração (número ou dado) sorteada AGORA, só para quem não resistiu; sem ela o estado é permanente.
        const duracao = e.duracao === undefined ? null : sortearDuracao(e.duracao, rng);
        aplicados.push({ id: e.id, stacks: e.stacks, origem: e.origem || '', ...(duracao !== null ? { duracao } : {}) });
    });
    return { aplicados, resistidos, pulados, ...(imunes.length ? { imunes } : {}) };
}

// Junta o mesmo estado vindo de várias fontes (soma os stacks, até 6). Duração: a MAIOR entre as fontes; se alguma fonte é permanente, o junto é permanente.
export function juntarAplicados(aplicados) {
    const mapa = new Map();
    (aplicados || []).forEach((a) => {
        const antes = mapa.get(a.id);
        const dur = normalizarDuracao(a.duracao);
        if (!antes) { mapa.set(a.id, { stacks: Math.min(MAX_STACKS, a.stacks), duracao: dur }); return; }
        const duracao = antes.duracao === null || dur === null ? null : Math.min(DURACAO_ESTADO_MAX, Math.max(antes.duracao, dur));
        mapa.set(a.id, { stacks: Math.min(MAX_STACKS, antes.stacks + a.stacks), duracao });
    });
    return [...mapa.entries()].map(([id, v]) => ({ id, stacks: v.stacks, ...(v.duracao !== null ? { duracao: v.duracao } : {}) }));
}

export function descreverResolucao(r, nomeAlvo = '') {
    if (!r) return '';
    const partes = juntarAplicados(r.aplicados).map(a => `${iconeDoEstado(a.id)} ${nomeDoEstado(a.id)} +${a.stacks}${a.duracao ? ` ${rotuloDuracao(a.duracao)}` : ''}`);
    const resistiu = r.resistidos.map(x => `${iconeDoEstado(x.id)} ${nomeDoEstado(x.id)} (teste ${x.total} contra CD ${x.cd})`);
    const texto = [];
    if (partes.length) texto.push(`${nomeAlvo ? `${nomeAlvo} ficou com` : 'Aplicou'}: ${partes.join(', ')}`);
    if (resistiu.length) texto.push(`resistiu a ${resistiu.join(', ')}`);
    const imune = (r.imunes || []).map(x => `${iconeDoEstado(x.id)} ${nomeDoEstado(x.id)}`);
    if (imune.length) texto.push(`é imune a ${imune.join(', ')}`);
    return texto.join(' · ');
}
