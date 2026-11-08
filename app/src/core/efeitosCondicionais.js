// ==========================================
// 🎯 EFEITOS CONDICIONAIS — lógica pura. Um efeito é { nome, atributo, propriedade, valor } e agora pode ter dois campos opcionais:
//   • quando — a CONDIÇÃO para valer ('' ou 'sempre' = sempre). Ex.: 'em_combate', 'empunhando_arma:espada', 'alvo_com_estado:surpreso'.
//   • escopo — a que rolagem vale (vantagem, desvantagem, piso do d20): 'ataque', 'teste', 'teste:<perícia ou atributo>' ou 'tudo'.
// Sem contexto, só valem os efeitos sem condição (uma condição desconhecida ou que não dá para checar NÃO vale: "falha fechado").
// Aqui também mora a coleta de efeitos de TODAS as fontes (Poderes, Passivas, Combos, Suporte, Arma Espiritual, Itens, Pactos).
// ==========================================
import { resolverEfeitosEntidade } from './efeitos-resolver.js';
import { efeitosDeCombos } from './combos.js';
import { efeitosAtivosDoItem, efeitosDaConfigAtiva } from './efeitosItem.js';
import { efeitosDeBuffsTemporarios, efeitosDeSuportePassivo } from './suporte.js';
import { efeitosDaArmaEspiritual } from './armaEspiritualEfeitos.js';
import { armaVirtualDaArmaEspiritual } from './armaEspiritualDano.js';
import { ESTADOS, condicoesDaFicha } from './condicoes.js';

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// ---------- 🧩 Coleta ----------

// Todos os efeitos que valem agora na ficha, numa lista só (sem filtrar por atributo nem condição).
// resolverEfeitosEntidade já embute a Forma ativa (ou a substitui com acumulaFormaBase === false); a Configuração (modo) da Forma é
// somada à parte, uma vez, por efeitosDaConfigAtiva, como em core/attributes.js > getBuffs.
export function coletarEfeitos(ficha) {
    if (!ficha) return [];
    const lista = [];
    const juntar = (efeitos) => { (efeitos || []).forEach(e => { if (e && typeof e === 'object') lista.push(e); }); };
    const juntarConfigDaForma = (entidade) => {
        const cfg = efeitosDaConfigAtiva(entidade);
        if (cfg) { juntar(cfg.efeitos); juntar(cfg.efeitosPassivos); }
    };

    (ficha.poderes || []).forEach(p => {
        if (!p) return;
        const resolved = resolverEfeitosEntidade(p);
        if (p.ativa) juntar(resolved.efeitos);
        juntar(resolved.efeitosPassivos);
        juntarConfigDaForma(p);
    });
    (ficha.passivas || []).forEach(p => { if (p) juntar(p.efeitos); });
    juntar(efeitosDeCombos(ficha)); // 🥋 Combos/Follow Ups (core/combos.js)
    juntar(efeitosDeBuffsTemporarios(ficha)); // ✨ Buffs temporários de Suporte (core/suporte.js)
    juntar(efeitosDeSuportePassivo(ficha)); // ✨ Suporte passivo (sempre ligado)
    juntar(efeitosDaArmaEspiritual(ficha)); // ⚔️ Buffs do estado em vigor da Arma Espiritual
    (ficha.inventario || []).filter(i => i && i.equipado).forEach(i => {
        const resolved = resolverEfeitosEntidade({ ...i, efeitos: efeitosAtivosDoItem(i) });
        juntar(resolved.efeitos);
        juntar(resolved.efeitosPassivos);
        juntarConfigDaForma(i);
    });
    // 🔮 Pactos/Entidades Seladas sincronizadas (campos "Buffs Ativos" e "Buffs Passivos" do Reino Interior), com a Forma ativa.
    (ficha.seresSelados || []).forEach(ser => {
        if (!ser || !ser.ativo) return;
        const resolved = resolverEfeitosEntidade(ser);
        juntar(resolved.efeitos);
        juntar(resolved.efeitosPassivos);
        juntarConfigDaForma(ser);
    });
    return lista;
}

// ---------- ❓ Condição ("quando") ----------

const IDS_ESTADOS = new Set(ESTADOS.map(e => e.id));

// Opções do editor. `argumento`: a condição pede um complemento depois dos dois pontos (tipo de arma, estado, % de vida).
export const OPCOES_QUANDO = [
    { id: 'sempre', rotulo: 'Sempre' },
    { id: 'em_combate', rotulo: 'Em combate (iniciativa ativa)' },
    { id: 'empunhando_arma', rotulo: 'Empunhando uma arma', argumento: 'tipo de arma (opcional)' },
    { id: 'alvo_com_estado', rotulo: 'Alvo com o estado…', argumento: 'estado' },
    { id: 'alvo_vida_abaixo', rotulo: 'Alvo com vida abaixo de…%', argumento: '%' },
];

// Devolve a condição em forma canônica ('' = sempre) ou null se for inválida.
export function normalizarQuando(valor) {
    const bruto = String(valor ?? '').trim();
    if (!bruto || semAcento(bruto) === 'sempre') return '';
    const [baseBruta, ...resto] = bruto.split(':');
    const base = semAcento(baseBruta);
    const arg = resto.join(':').trim();
    if (base === 'em_combate') return 'em_combate';
    if (base === 'empunhando_arma') return arg ? `empunhando_arma:${semAcento(arg)}` : 'empunhando_arma';
    if (base === 'alvo_com_estado') return IDS_ESTADOS.has(semAcento(arg)) ? `alvo_com_estado:${semAcento(arg)}` : null;
    if (base === 'alvo_vida_abaixo') {
        const pct = parseFloat(arg.replace(',', '.'));
        return Number.isFinite(pct) && pct > 0 && pct <= 100 ? `alvo_vida_abaixo:${pct}` : null;
    }
    return null;
}

// Atributos de efeito que LEEM a condição ("quando") e o escopo: são os que passam por valoresDeEfeitos/somarEfeitosBase. Os demais
// (forca, dano, status... lidos por core/attributes.js > getBuffs) não checam condição, então o sistema NÃO aceita condição neles:
// um efeito "dano +10 quando empunhando espada" valeria sempre. Condição nesses atributos descarta o efeito (falha fechada).
export const ATRIBUTOS_COM_QUANDO = [
    'acerto', 'evasiva', 'resistencia', 'iniciativa', 'vantagem', 'desvantagem', 'piso_d20',
    'margem_critico', 'margem_critico_fatal', 'critico_automatico', 'critico_fatal_automatico', 'imune_surpresa', 'imune_estado', 'resiste_estado', 'desvantagem_atacante', 'acerto_automatico',
];
// ---------- ✖️ Multiplicadores com condição ----------
// Os multiplicadores (mbase, mgeral, mformas, mabs, munico) são somados em core/attributes.js > getBuffs e core/poder.js >
// getPoderDiretoMultiplier. Eles aceitam "quando", mas SÓ as condições que dependem apenas da ficha do dono (sem alvo):
// em_combate e empunhando_arma[:tipo]. Condição de alvo (alvo_com_estado, alvo_vida_abaixo) nunca vale num multiplicador:
// o editor não a oferece, as criações a descartam e um efeito já salvo com ela simplesmente NÃO é aplicado (falha fechada).
export const PROPRIEDADES_MULTIPLICADOR = ['mbase', 'mgeral', 'mformas', 'mabs', 'munico'];
export const QUANDO_EM_MULTIPLICADOR = ['em_combate', 'empunhando_arma'];

export function ehPropriedadeMultiplicador(propriedade) {
    return PROPRIEDADES_MULTIPLICADOR.includes(String(propriedade ?? '').trim().toLowerCase());
}

// Opções do seletor "Quando" para a propriedade: as de multiplicador são só as permitidas acima.
export function opcoesQuandoPara(propriedade) {
    if (!ehPropriedadeMultiplicador(propriedade)) return OPCOES_QUANDO;
    return OPCOES_QUANDO.filter(o => o.id === 'sempre' || QUANDO_EM_MULTIPLICADOR.includes(o.id));
}

// Como normalizarQuando, mas null também para condição de alvo (que o multiplicador não aceita).
export function normalizarQuandoMultiplicador(valor) {
    const q = normalizarQuando(valor);
    if (q === null || q === '') return q;
    return QUANDO_EM_MULTIPLICADOR.includes(q.split(':')[0]) ? q : null;
}

// O multiplicador vale agora? Sem "quando" (ou 'sempre') sempre vale; com condição só as permitidas, contra o contexto de combate SEM alvo.
export function passaQuandoMultiplicador(efeito, contexto = {}) {
    const bruto = String((efeito && efeito.quando) ?? '').trim();
    if (!bruto) return true;
    const q = normalizarQuandoMultiplicador(bruto);
    if (q === null) return false;
    return q === '' ? true : passaQuando({ quando: q }, contexto);
}

// Atributos em que o escopo (a que rolagem vale) faz sentido.
export const ATRIBUTOS_COM_ESCOPO = ['vantagem', 'desvantagem', 'piso_d20'];
// Atributos cujo escopo é UM ESTADO (id de core/condicoes.js > ESTADOS) ou 'todos': imune_estado (não recebe o estado) e
// resiste_estado (vantagem no teste de resistência contra o estado).
export const ATRIBUTOS_COM_ESCOPO_ESTADO = ['imune_estado', 'resiste_estado'];
export const ESCOPO_TODOS_OS_ESTADOS = 'todos';

// O contexto de combate: { emCombate, armaTipos: [tipos normalizados], temArma, alvoEstados: [ids], alvoVidaPct }.
// A condição guardada é normalizada aqui também (dado gravado à mão como 'Em_Combate' vale); inválida nunca vale.
export function passaQuando(efeito, contexto = {}) {
    const bruto = String((efeito && efeito.quando) ?? '').trim();
    if (!bruto) return true;
    const normalizada = normalizarQuando(bruto);
    if (normalizada === null) return false;
    const q = normalizada || 'sempre';
    if (q === 'sempre') return true;
    const ctx = contexto || {};
    const [base, ...resto] = q.split(':');
    const arg = resto.join(':');
    switch (base) {
        case 'em_combate': return !!ctx.emCombate;
        case 'empunhando_arma':
            if (!arg) return !!ctx.temArma || (Array.isArray(ctx.armaTipos) && ctx.armaTipos.length > 0);
            return Array.isArray(ctx.armaTipos) && ctx.armaTipos.includes(semAcento(arg));
        case 'alvo_com_estado': return Array.isArray(ctx.alvoEstados) && ctx.alvoEstados.includes(arg);
        case 'alvo_vida_abaixo': return Number.isFinite(ctx.alvoVidaPct) && ctx.alvoVidaPct < parseFloat(arg);
        default: return false; // condição desconhecida: nunca vale
    }
}

// Tipos (normalizados) das armas equipadas, inclusive a Arma Espiritual equipada.
export function tiposDeArmasEquipadas(ficha) {
    const tipos = [];
    ((ficha && ficha.inventario) || []).forEach(i => {
        if (i && i.equipado && (i.tipo === 'arma' || i.tipo === 'artefato')) tipos.push(semAcento(i.armaTipo));
    });
    const espiritual = armaVirtualDaArmaEspiritual(ficha);
    if (espiritual) tipos.push(semAcento(espiritual.armaTipo));
    return tipos;
}

// Monta o contexto a partir da ficha de quem age e do alvo (ficha de personagem ou Dummie; pode ser null).
export function montarContextoDeCombate(ficha, alvo = null) {
    const armaTipos = tiposDeArmasEquipadas(ficha);
    const ctx = {
        emCombate: Number(ficha && ficha.iniciativa) > 0,
        armaTipos,
        temArma: ((ficha && ficha.inventario) || []).some(i => i && i.equipado && (i.tipo === 'arma' || i.tipo === 'artefato')) || armaTipos.length > 0,
        alvoEstados: [],
        alvoVidaPct: NaN,
    };
    if (alvo && typeof alvo === 'object') {
        const dono = alvo.isPersonagem && alvo.ficha ? alvo.ficha : alvo;
        ctx.alvoEstados = condicoesDaFicha(dono).map(c => c.id);
        const max = Number(alvo.hpMax);
        const atual = Number(alvo.hpAtual);
        if (Number.isFinite(max) && max > 0 && Number.isFinite(atual)) ctx.alvoVidaPct = Math.max(0, Math.min(100, (atual / max) * 100));
    }
    return ctx;
}

// ---------- 🎲 Escopo ----------

export const OPCOES_ESCOPO = [
    { id: '', rotulo: 'Padrão do efeito' },
    { id: 'ataque', rotulo: 'Só ataques' },
    { id: 'teste', rotulo: 'Todos os testes' },
    { id: 'teste:', rotulo: 'Um teste específico…', argumento: 'perícia ou atributo' },
    { id: 'tudo', rotulo: 'Ataques e testes' },
];

// Devolve o escopo em forma canônica ('' = padrão) ou null se for inválido.
export function normalizarEscopo(valor, atributo) {
    if (ATRIBUTOS_COM_ESCOPO_ESTADO.includes(atributo)) {
        const id = semAcento(valor);
        return id === ESCOPO_TODOS_OS_ESTADOS || IDS_ESTADOS.has(id) ? id : null;
    }
    const bruto = String(valor ?? '').trim();
    if (!bruto) return '';
    const [baseBruta, ...resto] = bruto.split(':');
    const base = semAcento(baseBruta);
    const arg = semAcento(resto.join(':'));
    if (base === 'ataque' || base === 'teste' || base === 'tudo') {
        if (base === 'teste' && resto.length) return arg ? `teste:${arg}` : 'teste';
        return resto.length ? null : base;
    }
    return null;
}

// O efeito vale para esta rolagem? `rolagem` = { tipo: 'ataque' | 'teste', ids: [perícia, atributo...] }; `padrao` = escopo quando o efeito não diz.
export function escopoPassa(efeito, rolagem, padrao = 'ataque') {
    const e = semAcento(efeito && efeito.escopo) || padrao;
    if (e === 'tudo') return true;
    const tipo = rolagem && rolagem.tipo;
    if (tipo === 'ataque') return e === 'ataque';
    if (tipo === 'teste') {
        if (e === 'teste') return true;
        if (e.startsWith('teste:')) return (rolagem.ids || []).map(semAcento).includes(e.slice(6));
    }
    return false;
}

// ---------- ➕ Somas ----------

// Valores numéricos dos efeitos BASE de um atributo que passam na condição (e, se pedido, no escopo).
export function valoresDeEfeitos(ficha, atributo, { contexto = {}, rolagem = null, escopoPadrao = 'ataque' } = {}) {
    return coletarEfeitos(ficha)
        .filter(e => e.atributo === atributo && e.propriedade === 'base' && passaQuando(e, contexto) && (!rolagem || escopoPassa(e, rolagem, escopoPadrao)))
        .map(e => parseFloat(e.valor) || 0);
}

// Soma dos efeitos BASE de um atributo (acerto, evasiva, resistencia, iniciativa...) que passam na condição.
export function somarEfeitosBase(ficha, atributo, contexto = {}) {
    return valoresDeEfeitos(ficha, atributo, { contexto }).reduce((s, v) => s + v, 0);
}

// 🛡️ Imunidade a estados por efeito (valor > 0): `imune_estado` com escopo = id do estado (ou 'todos') e, por compatibilidade,
// `imune_surpresa` (= imune ao Surpreso).
const IMUNIDADE_DE_ESTADO = { surpreso: 'imune_surpresa' };

// Há algum efeito válido (valor > 0, condição ok) de `atributo` cujo escopo é o estado (ou 'todos')?
function temEfeitoDeEstado(ficha, atributo, estadoId) {
    const contexto = montarContextoDeCombate(ficha);
    return coletarEfeitos(ficha).some((e) => {
        if (e.atributo !== atributo || e.propriedade !== 'base' || !(parseFloat(e.valor) > 0) || !passaQuando(e, contexto)) return false;
        const escopo = semAcento(e.escopo);
        return escopo === ESCOPO_TODOS_OS_ESTADOS || escopo === estadoId;
    });
}

// Vantagem (2 d20, vale o maior) no teste para resistir a este estado: efeito `resiste_estado`.
export function resisteAoEstado(ficha, estadoId) {
    return !!ficha && temEfeitoDeEstado(ficha, 'resiste_estado', estadoId);
}

// A ficha é imune a este estado por algum efeito (Poder, Passiva, Item, Pacto...)? Ficha vazia/Dummie (null) nunca é.
export function imuneAoEstado(ficha, estadoId) {
    if (!ficha) return false;
    if (temEfeitoDeEstado(ficha, 'imune_estado', estadoId)) return true;
    const atributo = IMUNIDADE_DE_ESTADO[estadoId];
    return !!atributo && somarEfeitosBase(ficha, atributo, montarContextoDeCombate(ficha)) > 0;
}

// Menor valor entre os efeitos (para "o crítico começa em N": vale o menor N). null se nenhum efeito vale.
export function menorValorDeEfeitos(ficha, atributo, contexto = {}) {
    const valores = valoresDeEfeitos(ficha, atributo, { contexto }).filter(v => v > 0);
    return valores.length ? Math.min(...valores) : null;
}

// ---------- 🎯 Efeitos que mexem no golpe dos OUTROS ou garantem o acerto ----------

export const LIMITE_DESVANTAGEM_IMPOSTA = 10;
export const LIMITE_MULT_CRITICO_EXTRA = 100;

// Soma só os valores finitos e positivos (negativo ou lixo é ignorado).
const somaPositivos = (valores) => valores.filter(v => Number.isFinite(v) && v > 0).reduce((s, v) => s + v, 0);

// 🛡️ `desvantagem_atacante`: quantos dados de desvantagem a ficha DEFENSORA impõe a quem a ataca (2 = "dupla desvantagem").
// Vem dos efeitos da própria ficha defensora (Poder ativo/passivo, Item equipado, Forma, Pacto...). Dummie sem ficha = 0.
// A condição "quando" é checada do ponto de vista do defensor; o "alvo" do contexto é o atacante (se informado).
export function desvantagemImpostaAoAtacante(fichaDefensor, fichaAtacante = null) {
    if (!fichaDefensor || typeof fichaDefensor !== 'object') return 0;
    const contexto = montarContextoDeCombate(fichaDefensor, fichaAtacante);
    const total = Math.floor(somaPositivos(valoresDeEfeitos(fichaDefensor, 'desvantagem_atacante', { contexto })));
    return Math.min(LIMITE_DESVANTAGEM_IMPOSTA, total);
}

// 🎯 `acerto_automatico` (valor > 0): o golpe de quem tem o efeito conta como acerto sem comparar com a defesa. `alvo` (opcional) checa o "quando".
export function temAcertoAutomatico(ficha, alvo = null) {
    if (!ficha || typeof ficha !== 'object') return false;
    const contexto = montarContextoDeCombate(ficha, alvo);
    return somaPositivos(valoresDeEfeitos(ficha, 'acerto_automatico', { contexto })) > 0;
}

// 💥 `mult_critico` / `mult_critico_fatal`: quanto SOMAR ao multiplicador do Crítico (base x2) e do Crítico Fatal (base x4).
// Valores negativos são ignorados; o total de cada um fica entre 0 e 100.
export function multiplicadoresCriticoExtra(ficha) {
    if (!ficha || typeof ficha !== 'object') return { normal: 0, fatal: 0 };
    const contexto = montarContextoDeCombate(ficha);
    const soma = (atributo) => Math.min(LIMITE_MULT_CRITICO_EXTRA, somaPositivos(valoresDeEfeitos(ficha, atributo, { contexto })));
    return { normal: soma('mult_critico'), fatal: soma('mult_critico_fatal') };
}
