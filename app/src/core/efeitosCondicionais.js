// ==========================================
// 🎯 EFEITOS CONDICIONAIS — lógica pura. Um efeito é { nome, atributo, propriedade, valor } e agora pode ter dois campos opcionais:
//   • quando — a CONDIÇÃO para valer ('' ou 'sempre' = sempre). Ex.: 'em_combate', 'empunhando_arma:espada', 'alvo_com_estado:surpreso',
//     'eu_com_estado:escondido' (o próprio portador), 'alvo_defende_com:evasiva'.
//     INDESVIÁVEL = efeito acerto_automatico (valor 1) com quando 'alvo_defende_com:evasiva'; IMBLOQUEÁVEL = o mesmo com 'alvo_defende_com:resistencia'.
//   • escopo — a que rolagem vale (vantagem, desvantagem, piso do d20): 'ataque', 'teste', 'teste:<perícia ou atributo>' ou 'tudo'.
// Sem contexto, só valem os efeitos sem condição (uma condição desconhecida ou que não dá para checar NÃO vale: "falha fechado").
// Aqui também mora a coleta de efeitos de TODAS as fontes (Poderes, Passivas, Combos, Suporte, Arma Espiritual, Itens, Pactos).
// ==========================================
import { resolverEfeitosEntidade } from './efeitos-resolver.js';
import { efeitosDeCombos, estadoDeCombo } from './combos.js';
import { efeitosAtivosDoItem, efeitosDaConfigAtiva } from './efeitosItem.js';
import { efeitosDeBuffsTemporarios, efeitosDeSuportePassivo, temBuffNegativo } from './suporte.js';
import { efeitosDaArmaEspiritual } from './armaEspiritualEfeitos.js';
import { armaVirtualDaArmaEspiritual } from './armaEspiritualDano.js';
import { ESTADOS, condicoesDaFicha, temEstadoNegativo } from './condicoes.js';
import { ATRIBUTO_DANO_DADOS, lerDadoDeDano, limitarDadosDeEfeitos } from './danoDados.js';
import { ataquesNoTurno } from './ataquesNoTurno.js';
import { efeitosDeAliados } from './efeitosDeAliados.js';
import { contarAliadosEmCampoDaMesa, normalizarFiltroAliado, filtroAliadoParaTexto, nomeDoPortador } from './aliadosEmCampo.js';
import { efeitosDeInimigosDaMesa } from './efeitosDeInimigos.js';
import { existeEstadoEmCampoDaMesa } from './estadoEmCampo.js';

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// ---------- 🧩 Coleta ----------

// Todos os efeitos que valem agora na ficha, numa lista só (sem filtrar por atributo nem condição).
// resolverEfeitosEntidade já embute a Forma ativa (ou a substitui com acumulaFormaBase === false); a Configuração (modo) da Forma é
// somada à parte, uma vez, por efeitosDaConfigAtiva, como em core/attributes.js > getBuffs.
export function coletarEfeitos(ficha, nomePortador = '') {
    if (!ficha) return [];
    const lista = [];
    // Efeito `valeParaInimigos` é penalidade dos INIMIGOS do portador (core/efeitosDeInimigos.js): nunca vale para o próprio dono.
    const juntar = (efeitos) => { (efeitos || []).forEach(e => { if (e && typeof e === 'object' && e.valeParaInimigos !== true) lista.push(e); }); };
    const juntarConfigDaForma = (entidade) => {
        const cfg = efeitosDaConfigAtiva(entidade);
        if (cfg) { juntar(cfg.efeitos); juntar(cfg.efeitosPassivos); }
    };

    (ficha.poderes || []).forEach(p => {
        if (!p) return;
        const resolved = resolverEfeitosEntidade(p, ficha, nomePortador);
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
        const resolved = resolverEfeitosEntidade({ ...i, efeitos: efeitosAtivosDoItem(i) }, ficha);
        juntar(resolved.efeitos);
        juntar(resolved.efeitosPassivos);
        juntarConfigDaForma(i);
    });
    // 🤝 Efeitos dos Poderes de ALIADOS na cena ativa marcados `valeParaAliados` (core/efeitosDeAliados.js).
    juntar(efeitosDeAliados(ficha, nomePortador));
    // ☠️ Penalidades que os INIMIGOS na cena ativa impõem a quem defende/ataca aqui (já com a condição checada no portador inimigo; core/efeitosDeInimigos.js).
    juntar(efeitosDeInimigosDaMesa(ficha, nomeDoPortador(ficha, nomePortador), avaliarEfeitoDeInimigo));
    // 🔮 Pactos/Entidades Seladas sincronizadas (campos "Buffs Ativos" e "Buffs Passivos" do Reino Interior), com a Forma ativa.
    (ficha.seresSelados || []).forEach(ser => {
        if (!ser || !ser.ativo) return;
        const resolved = resolverEfeitosEntidade(ser, ficha);
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
    { id: 'alvo_defende_com', rotulo: 'Alvo defende com… (Indesviável/Imbloqueável)', argumento: 'Evasiva ou Resistência' },
    { id: 'eu_com_estado', rotulo: 'Eu (portador) com o estado…', argumento: 'estado' },
    { id: 'alvo_vida_abaixo', rotulo: 'Alvo com vida abaixo de…%', argumento: '%' },
    // Debuff = estado negativo ativo OU buff temporário negativo do alvo (core/condicoes.js > ESTADOS_NAO_NEGATIVOS, core/suporte.js > temBuffNegativo).
    { id: 'alvo_com_debuff', rotulo: 'Alvo com algum debuff (estado negativo)' },
    // Do portador: Combos finalizados neste combate (core/combos.js) e primeiro ataque do turno dele (core/ataquesNoTurno.js; só em combate).
    { id: 'combos_finalizados', rotulo: 'Eu finalizei ao menos… Combos', argumento: 'quantos Combos' },
    { id: 'primeiro_ataque_do_turno', rotulo: 'Primeiro ataque do meu turno' },
    // Aliados do portador na CENA ATIVA (core/aliadosEmCampo.js), conscientes ou não, com filtro opcional por afiliação/Raça/Classe.
    { id: 'aliados_em_campo', rotulo: 'Ao menos… aliados em campo (cena ativa)', argumento: 'quantos aliados' },
    // Alguém (de qualquer lado) com o estado, na CENA ATIVA (core/estadoEmCampo.js): ex.: a Presa de um portador.
    { id: 'estado_em_campo', rotulo: 'Há alguém com o estado… em campo (cena ativa)', argumento: 'estado' },
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
    if (base === 'alvo_defende_com') { const d = semAcento(arg); return d === 'evasiva' || d === 'resistencia' ? `alvo_defende_com:${d}` : null; }
    if (base === 'eu_com_estado') return IDS_ESTADOS.has(semAcento(arg)) ? `eu_com_estado:${semAcento(arg)}` : null;
    if (base === 'alvo_com_debuff') return 'alvo_com_debuff';
    if (base === 'estado_em_campo') return IDS_ESTADOS.has(semAcento(arg)) ? `estado_em_campo:${semAcento(arg)}` : null;
    if (base === 'aliados_em_campo') {
        // arg = "N" ou "N:tipo=valor" (tipo: afiliacao | raca | classe). Filtro escrito mas inválido invalida a condição (nunca vira "sem filtro").
        const [nTxt, ...restoFiltro] = arg.split(':');
        const n = /^\d{1,3}$/.test(nTxt.trim()) ? parseInt(nTxt, 10) : NaN;
        if (!Number.isInteger(n) || n < 1 || n > 200) return null;
        const textoFiltro = restoFiltro.join(':').trim();
        if (!textoFiltro) return `aliados_em_campo:${n}`;
        const f = normalizarFiltroAliado(textoFiltro);
        return f ? `aliados_em_campo:${n}:${filtroAliadoParaTexto(f)}` : null;
    }
    if (base === 'primeiro_ataque_do_turno') return 'primeiro_ataque_do_turno';
    if (base === 'combos_finalizados') {
        const n = /^\d{1,3}$/.test(arg) ? parseInt(arg, 10) : NaN;
        return Number.isInteger(n) && n >= 1 && n <= 999 ? `combos_finalizados:${n}` : null;
    }
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
    'margem_critico', 'margem_critico_fatal', 'critico_automatico', 'critico_fatal_automatico', 'imune_surpresa', 'imune_estado', 'resiste_estado', 'desvantagem_atacante', 'acerto_automatico', ATRIBUTO_DANO_DADOS, 'movimento', 'velocidade_zero',
];
// ---------- ✖️ Multiplicadores com condição ----------
// Os multiplicadores (mbase, mgeral, mformas, mabs, munico) são somados em core/attributes.js > getBuffs e core/poder.js >
// getPoderDiretoMultiplier. Eles aceitam "quando", mas SÓ as condições que dependem apenas da ficha do dono (sem alvo):
// em_combate, empunhando_arma[:tipo], eu_com_estado:<id> (o PRÓPRIO portador está com o estado) e aliados_em_campo:N (aliados na cena ativa); nenhuma precisa de alvo. Condição de alvo (alvo_com_estado, alvo_vida_abaixo) nunca vale num multiplicador:
// o editor não a oferece, as criações a descartam e um efeito já salvo com ela simplesmente NÃO é aplicado (falha fechada).
export const PROPRIEDADES_MULTIPLICADOR = ['mbase', 'mgeral', 'mformas', 'mabs', 'munico'];
export const QUANDO_EM_MULTIPLICADOR = ['em_combate', 'empunhando_arma', 'eu_com_estado', 'aliados_em_campo'];

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

// O contexto de combate: { emCombate, armaTipos: [tipos normalizados], temArma, euEstados: [ids do portador], alvoEstados: [ids], alvoVidaPct, alvoDebuff,
// combosFinalizados, primeiroAtaqueDoTurno }. Sem contexto (ou sem alvo) as condições de alvo e as novas do portador NÃO valem (falham fechadas).
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
        case 'alvo_defende_com': return ctx.alvoDefesa === arg;
        case 'eu_com_estado': return Array.isArray(ctx.euEstados) && ctx.euEstados.includes(arg);
        case 'alvo_vida_abaixo': return Number.isFinite(ctx.alvoVidaPct) && ctx.alvoVidaPct < parseFloat(arg);
        case 'alvo_com_debuff': return ctx.alvoDebuff === true;
        // Sem contexto da mesa a condição falha fechada.
        case 'estado_em_campo': return typeof ctx.temEstadoEmCampo === 'function' && ctx.temEstadoEmCampo(arg) === true;
        case 'combos_finalizados': return Number.isFinite(ctx.combosFinalizados) && ctx.combosFinalizados >= parseInt(arg, 10);
        case 'primeiro_ataque_do_turno': return ctx.primeiroAtaqueDoTurno === true;
        case 'aliados_em_campo': {
            // Sem contexto da mesa (ou sem o contador) a condição falha fechada.
            if (typeof ctx.contarAliadosEmCampo !== 'function') return false;
            const [nTxt, ...restoFiltro] = arg.split(':');
            const n = parseInt(nTxt, 10);
            const total = Number(ctx.contarAliadosEmCampo(normalizarFiltroAliado(restoFiltro.join(':'))));
            return Number.isFinite(n) && Number.isFinite(total) && total >= n;
        }
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

// Monta o contexto a partir da ficha de quem age e do alvo (ficha de personagem; pode ser null).
// `nomePortador`: chave do portador em `personagens` (obrigatória para as condições/escalas de aliados; sem ela contam 0).
export function montarContextoDeCombate(ficha, alvo = null, nomePortador = '') {
    const armaTipos = tiposDeArmasEquipadas(ficha);
    const ctx = {
        emCombate: Number(ficha && ficha.iniciativa) > 0,
        armaTipos,
        temArma: ((ficha && ficha.inventario) || []).some(i => i && i.equipado && (i.tipo === 'arma' || i.tipo === 'artefato')) || armaTipos.length > 0,
        euEstados: ficha ? condicoesDaFicha(ficha).map(c => c.id) : [],
        alvoEstados: [],
        alvoDefesa: '',
        alvoVidaPct: NaN,
        alvoDebuff: false,
        // Do portador: Combos finalizados neste combate e se este seria o 1º ataque do turno dele (só em combate: fora da iniciativa não há turno).
        combosFinalizados: ficha ? estadoDeCombo(ficha).finalizados : 0,
        primeiroAtaqueDoTurno: !!ficha && Number(ficha.iniciativa) > 0 && ataquesNoTurno(ficha) === 0,
        // Aliados do portador na cena ativa (preguiçoso: só lê a mesa quando alguma condição aliados_em_campo é avaliada). Filtro = { tipo, valor } ou null.
        nomePortador: nomePortador || '',
        // "Há alguém com o estado X na cena ativa?" (core/estadoEmCampo.js; preguiçoso, só devolve verdadeiro/falso).
        temEstadoEmCampo: (id) => existeEstadoEmCampoDaMesa(id),
        contarAliadosEmCampo: ficha ? (filtro = null) => contarAliadosEmCampoDaMesa(ficha, filtro, nomeDoPortador(ficha, nomePortador)) : null,
    };
    if (alvo && typeof alvo === 'object') {
        const dono = alvo.isPersonagem && alvo.ficha ? alvo.ficha : alvo;
        ctx.alvoEstados = condicoesDaFicha(dono).map(c => c.id);
        ctx.alvoDebuff = temEstadoNegativo(dono) || temBuffNegativo(dono);
        // Defesa que o alvo usa contra o golpe ('evasiva' | 'resistencia'): a maior das duas (core/alvoCombate.js e Gaveta de NPCs).
        ctx.alvoDefesa = semAcento(alvo.tipoDefesa);
        const max = Number(alvo.hpMax);
        const atual = Number(alvo.hpAtual);
        if (Number.isFinite(max) && max > 0 && Number.isFinite(atual)) ctx.alvoVidaPct = Math.max(0, Math.min(100, (atual / max) * 100));
    }
    return ctx;
}

// ☠️ Condição de um efeito `valeParaInimigos` avaliada NO PORTADOR (o dono do Poder), sem alvo: ex.: 'estado_em_campo:presa'.
function avaliarEfeitoDeInimigo(portador, nome, efeito) {
    return passaQuando(efeito, montarContextoDeCombate(portador, null, nome));
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
    return coletarEfeitos(ficha, contexto && contexto.nomePortador)
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

// A ficha é imune a este estado por algum efeito (Poder, Passiva, Item, Pacto...)? Ficha vazia (null) nunca é.
export function imuneAoEstado(ficha, estadoId) {
    if (!ficha) return false;
    if (temEfeitoDeEstado(ficha, 'imune_estado', estadoId)) return true;
    const atributo = IMUNIDADE_DE_ESTADO[estadoId];
    return !!atributo && somarEfeitosBase(ficha, atributo, montarContextoDeCombate(ficha)) > 0;
}

// 🎲 `dano_dados`: dados que os efeitos somam ao dano ROLADO do golpe: [{ nome, qtd, faces }] dos efeitos válidos (propriedade base, valor "NdM" ou
// { qtd, faces }) cuja condição ("quando") passa no contexto, já limitados ao total de dados do golpe (core/danoDados.js). Lido por core/engine.js > calcularDano.
export function dadosBonusDeDano(ficha, contexto = {}) {
    const lista = [];
    coletarEfeitos(ficha).forEach((e) => {
        if (!e || e.atributo !== ATRIBUTO_DANO_DADOS || String(e.propriedade ?? 'base').trim().toLowerCase() !== 'base') return;
        if (!passaQuando(e, contexto)) return;
        const d = lerDadoDeDano(e.valor);
        if (d) lista.push({ nome: String(e.nome ?? '').slice(0, 80), ...d });
    });
    return limitarDadosDeEfeitos(lista);
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
// Vem dos efeitos da própria ficha defensora (Poder ativo/passivo, Item equipado, Forma, Pacto...).
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
