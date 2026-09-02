// ==========================================
// PODER ATUAL (SCOUTER) — Réplica pura do cálculo de "Poder Atual (c/ Formas)"
// exibido no Scouter (Ficha Def/Marcados.jsx), para reuso em qualquer painel
// que precise mostrar o mesmo número (ex: moldura de combate do Mapa).
// ==========================================
import { getBuffs, getEfetivoBase, getRawBase } from './attributes.js';
import { getRank } from './prestige.js';
import { resolverEfeitosEntidade } from './efeitos-resolver.js';
import { calcularFadigaAtual } from './fadiga.js';

const CATEGORIAS_VITAIS = ['vida', 'mana', 'aura', 'chakra', 'corpo'];
const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

function getEfetivoMFormas(ficha, k, ignorarPoderes = false) {
    const anchor = k === 'status' ? 'forca' : k;
    let s = ficha?.[anchor] || {};
    let b = getBuffs(ficha, anchor, true, false, ignorarPoderes) || {};
    let v = parseFloat(s.mFormas) || 1.0;
    if (!b._hasBuff || !b._hasBuff.mformas) return v;
    return (v === 1.0 ? 0 : v) + b.mformas;
}

function getBasePFor(ficha, k) {
    const mults = { vida: 1000000, mana: 10000000, aura: 10000000, chakra: 10000000, corpo: 10000000, status: 1000 };
    const div = parseFloat(ficha?.divisores?.[k]) || 1;
    if (k === 'status') {
        let m = 0;
        STATUS_FISICOS.forEach(s => { m += getRawBase(ficha, s); });
        return Math.floor(((m / 8) / mults.status) * div) || 0;
    }
    return Math.floor((getRawBase(ficha, k) / (mults[k] || 1)) * div) || 0;
}

function getPontosParaAscensao(ficha, key) {
    if (key === 'status') return parseFloat(ficha?.statusPrestigioAplicado) || 0;
    return getBasePFor(ficha, key);
}

function safeGetRank(prest, asc) {
    try {
        const r = getRank(prest, asc);
        if (r && typeof r === 'object') return { ...r };
        return { l: 'F', c: '#ffffff', a: isNaN(asc) ? 1 : asc };
    } catch (e) {
        return { l: 'F', c: '#ffffff', a: isNaN(asc) ? 1 : asc };
    }
}

function aplicarMultiplicadorForca(prestigioBase, ascensaoBase, multiplicadorForcaPrestigio, multiplicadorForcaAscensao) {
    const multP = parseFloat(multiplicadorForcaPrestigio) || 1;
    const multA = parseFloat(multiplicadorForcaAscensao) || 1;
    const ascensaoBaseEfetiva = (parseInt(ascensaoBase) || 1) * multA;
    const prestigioTotal = (prestigioBase || 0) * multP;
    const bonusAscensao = Math.floor(prestigioTotal / 100);
    const prestigioFinal = prestigioTotal % 100;
    const ascensaoFinal = ascensaoBaseEfetiva + bonusAscensao;
    const rankInfo = safeGetRank(prestigioFinal, ascensaoFinal);
    return { ...rankInfo, prestigioFinal, ascensaoFinal };
}

function calcularAscensaoParaPoder(ficha) {
    if (!ficha) return 1;
    const ascensaoBase = parseInt(ficha.ascensaoBase) || 1;
    const multP = ficha.multiplicadorForcaPrestigio ?? 1;
    const multA = parseFloat(ficha.multiplicadorForcaAscensao) || 1;
    const ascensaoBaseEfetiva = ascensaoBase * multA;

    const bonusPorCategoria = [...CATEGORIAS_VITAIS, 'status'].map(k => {
        const displayP = getPontosParaAscensao(ficha, k);
        let mF = getEfetivoMFormas(ficha, k, true);
        let multForma = mF >= 10 ? (mF / 10) : (mF > 1 ? mF : 1);
        let pAtual = Math.floor(displayP * multForma);
        const rankInfo = aplicarMultiplicadorForca(pAtual, ascensaoBase, multP, multA);
        return Math.max(0, (rankInfo.ascensaoFinal || 0) - ascensaoBaseEfetiva);
    });
    // 🔥 CORREÇÃO: antes usava Math.min(...) — a Ascensão geral (e portanto o Poder Calculado)
    // ficava travada na categoria MAIS FRACA das 6, então multiplicadorForcaPrestigio só tinha
    // efeito em Poder se TODAS as 6 categorias (vida/mana/aura/chakra/corpo/status) subissem de
    // nível juntas. Trocado pela MÉDIA (arredondada pra baixo) das 6 categorias: agora qualquer
    // categoria que suba de nível — sozinha ou não — contribui pro ganho geral, sem depender das
    // outras acompanharem no mesmo instante. Isso alinha o comportamento de
    // multiplicadorForcaPrestigio com o de multiplicadorForcaAscensao, que já nunca fica travado
    // por nenhuma categoria específica.
    const nivelCompletos = Math.floor(bonusPorCategoria.reduce((a, b) => a + b, 0) / bonusPorCategoria.length);
    const geral = (ascensaoBase + nivelCompletos) * multA;
    return isNaN(geral) ? ascensaoBase : geral;
}

function getGlobalMultipliers(ficha) {
    try {
        if (!ficha) return { finalB: 1, finalG: 1, finalF: 1, finalA: 1, finalUni: 1, totalDano: 1 };

        let grupos = { MBASE: {}, MGERAL: {}, MFORMAS: {}, MABS: {} };
        let unicos = [];

        const addManual = (val, type, sourceName) => {
            let v = parseFloat(val);
            if (!isNaN(v) && v > 0 && v !== 1) {
                grupos[type][sourceName] = (grupos[type][sourceName] || 0) + v;
            }
        };

        let d = ficha?.dano || {};
        addManual(d.mBase, 'MBASE', 'Ficha_Manual');
        addManual(d.mGeral, 'MGERAL', 'Ficha_Manual');
        addManual(d.mAbsoluto, 'MABS', 'Ficha_Manual');
        if (d.mUnico) {
            String(d.mUnico).split(',').forEach(v => {
                let n = parseFloat(v.trim());
                if (!isNaN(n) && n > 0) unicos.push(n);
            });
        }

        ['vida', 'mana', 'aura', 'chakra', 'corpo', 'status'].forEach(k => {
            const mF = getEfetivoMFormas(ficha, k, true);
            if (!isNaN(mF) && mF > 1) {
                grupos.MFORMAS[`Eixo_${k}`] = (grupos.MFORMAS[`Eixo_${k}`] || 0) + (mF - 1);
            }
        });

        let b = getBuffs(ficha, 'dano', true, false, true) || {};
        if (b._hasBuff) {
            if (b.mbase) addManual(b.mbase, 'MBASE', 'Buff_Sistema');
            if (b.mgeral) addManual(b.mgeral, 'MGERAL', 'Buff_Sistema');
            if (b.mabs) addManual(b.mabs, 'MABS', 'Buff_Sistema');
            if (b.munico && Array.isArray(b.munico)) {
                b.munico.forEach(n => { if (!isNaN(n) && n > 0) unicos.push(n); });
            }
        }

        const scanCategory = (cat, flagAtivo = 'ativo', camposTexto = ['efeitos', 'desc']) => {
            if (!ficha[cat]) return;
            Object.values(ficha[cat]).forEach(item => {
                if (item && item[flagAtivo] && !item.deletado) {
                    const nomeSkill = String(item.nome || 'Desconhecido').trim().toUpperCase();
                    const processText = (txt) => {
                        if (!txt) return;
                        const regex = /(MBASE|MGERAL|MFORMAS|MABS|MUNICO)\s*:\s*\+?\s*(-?\d+(?:[.,]\d+)?)/gi;
                        let match;
                        while ((match = regex.exec(txt)) !== null) {
                            const tipo = match[1].toUpperCase();
                            const val = parseFloat(match[2].replace(',', '.'));
                            if (isNaN(val)) continue;

                            if (tipo === 'MUNICO') {
                                if (val > 0) unicos.push(val);
                            } else if (grupos[tipo]) {
                                grupos[tipo][nomeSkill] = (grupos[tipo][nomeSkill] || 0) + val;
                            }
                        }
                    };
                    camposTexto.forEach(campo => processText(item[campo]));
                }
            });
        };
        ['passivas', 'habilidades', 'transformacoes', 'magias', 'relicarios', 'itens'].forEach(cat => scanCategory(cat));
        scanCategory('ataquesElementais', 'equipado', ['descricao', 'efeitos', 'desc']);

        const calcTotal = (tipo) => {
            let soma = 0;
            Object.values(grupos[tipo]).forEach(v => { soma += v; });
            return 1 + soma;
        };

        let finalB = calcTotal('MBASE');
        let finalG = calcTotal('MGERAL');
        let finalF = calcTotal('MFORMAS');
        let finalA = calcTotal('MABS');

        let finalUni = 1.0;
        unicos.forEach(n => { finalUni *= n; });

        // 🔥 finalUni (mUnico) fica DE FORA de totalDano de propósito — é aplicado
        // separadamente em calcularPoderAtual, no MESMO estágio (pós-injeção de
        // Ascensão) que multiplicadorPoderDireto e multiplicadorMunicoCrescente.
        // Ver o mesmo comentário/motivo em Ficha Def/Marcados.jsx > poderGlobal.
        return { finalB, finalG, finalF, finalA, finalUni, totalDano: finalB * finalG * finalA };
    } catch (e) {
        return { finalB: 1, finalG: 1, finalF: 1, finalA: 1, finalUni: 1, totalDano: 1 };
    }
}

function getPoderDiretoMultiplier(ficha) {
    if (!ficha || !ficha.poderes) return 1;
    try {
        let grupos = { mbase: 0, mgeral: 0, mformas: 0, mabs: 0 };
        let unicos = [];

        const processar = (efeitos) => {
            if (!efeitos) return;
            efeitos.forEach(e => {
                if (!e || (e.atributo || '').toLowerCase() !== 'poder_direto') return;
                const prop = (e.propriedade || '').toLowerCase();
                const val = parseFloat(e.valor);
                if (isNaN(val)) return;
                if (prop === 'munico') { if (val > 0) unicos.push(val); }
                else if (grupos.hasOwnProperty(prop)) grupos[prop] += val;
            });
        };

        ficha.poderes.forEach(p => {
            if (!p) return;
            const resolved = resolverEfeitosEntidade(p);
            if (p.ativa) processar(resolved.efeitos);
            processar(resolved.efeitosPassivos);
        });

        let finalUni = 1.0;
        unicos.forEach(n => { finalUni *= n; });

        return (1 + grupos.mbase) * (1 + grupos.mgeral) * (1 + grupos.mformas) * (1 + grupos.mabs) * finalUni;
    } catch (e) {
        return 1;
    }
}

// ♾️ mUnico Crescente (Infinities tipo Adaptação) — réplica exata de
// getMunicoCrescenteMultiplier em Ficha Def/Marcados.jsx. Cresce automaticamente
// a cada turno de combate (combate.municoTurnos x combate.municoPorTurno) e
// multiplica junto de multiplicadorPoderDireto/glob.finalUni no mesmo estágio
// pós-injeção de Ascensão, pra não ser diluído.
function getMunicoCrescenteMultiplier(ficha) {
    const turnos = Math.max(0, Number(ficha?.combate?.municoTurnos) || 0);
    if (turnos <= 0) return 1;
    const taxaBruta = Number(ficha?.combate?.municoPorTurno);
    const taxa = isNaN(taxaBruta) ? 5 : taxaBruta;
    return Math.max(1, 1 + (turnos * taxa / 100));
}

export function getTemaScouter(supressao, limite = 1) {
    if (supressao >= 100) return { cor: '#ffcc00', glow: '#ff8800', nome: 'Poder Máximo (Liberto)', pulse: '0.8s' };
    if (supressao >= 50) return { cor: '#00e5ff', glow: '#0088ff', nome: 'Supressão Leve (Restrito)', pulse: '1.5s' };
    if (supressao >= 10) return { cor: '#b142ff', glow: '#6a00ff', nome: 'Ocultação Profunda', pulse: '3s' };
    if (supressao > limite) return { cor: '#00ff66', glow: '#00aa44', nome: 'Furtividade Extrema', pulse: '5s' };
    return { cor: '#ff003c', glow: '#880000', nome: 'Anulação no Limite', pulse: '8s' };
}

// Réplica exata do useMemo de `poderGlobal` em Ficha Def/Marcados.jsx.
export function calcularPoderAtual(ficha, divisorPoderMesa) {
    if (!ficha) return { poderGlobal: 0, vitalidadeGlobal: 0, supressao: 100, limiteSupressao: 1, temaScouter: getTemaScouter(100, 1) };

    let sup = parseFloat(ficha.supressaoPoder);
    if (isNaN(sup)) sup = 100;
    let lim = parseFloat(ficha.limiteSupressao);
    if (isNaN(lim)) lim = 1;
    if (sup < lim) sup = lim;

    const tema = getTemaScouter(sup, lim);

    const calcPoderBase = () => {
        const efetivo = (k) => {
            const buffsCache = getBuffs(ficha, k, false, false, true);
            const v = getEfetivoBase(ficha, k, false, buffsCache);
            return isNaN(v) ? 0 : v;
        };
        let somaStatus = 0;
        STATUS_FISICOS.forEach(s => { somaStatus += efetivo(s); });
        const statusEfetivo = somaStatus / 8;
        return ((efetivo('vida') * 10) + efetivo('chakra') + efetivo('mana') + efetivo('corpo') + efetivo('aura') + (statusEfetivo * 100)) / 6;
    };

    const poderBase = calcPoderBase();
    const glob = getGlobalMultipliers(ficha);

    const ascensaoSegura = Number(calcularAscensaoParaPoder(ficha)) || 0;
    const multiplicadorAscensao = Math.pow(2, Math.min(1000, Math.max(0, ascensaoSegura)));

    const SATURACAO_SEGURA = 1e308;
    const clampFinito = (v) => Number.isFinite(v) ? v : (Number.isNaN(v) ? 0 : Math.sign(v) * SATURACAO_SEGURA);

    let poderMultiplicado = poderBase * multiplicadorAscensao * glob.finalF * glob.totalDano;
    poderMultiplicado = clampFinito(poderMultiplicado);

    let poderComAscensao;
    if (poderMultiplicado > 0) {
        const magnitude = Math.floor(Math.log10(poderMultiplicado));
        poderComAscensao = poderMultiplicado + (ascensaoSegura * Math.pow(10, magnitude + 1));
    } else {
        poderComAscensao = (ascensaoSegura * 10) + poderMultiplicado;
    }
    poderComAscensao = clampFinito(poderComAscensao);

    // 🔥 TODO mUnico se junta aqui, no mesmo estágio (pós-injeção de Ascensão) —
    // ver o mesmo comentário/motivo em Ficha Def/Marcados.jsx > poderGlobal.
    const multiplicadorPoderDireto = clampFinito(getPoderDiretoMultiplier(ficha));
    const multiplicadorMunicoCrescente = clampFinito(getMunicoCrescenteMultiplier(ficha));
    const multiplicadorMunicoTotal = clampFinito(glob.finalUni) * multiplicadorPoderDireto * multiplicadorMunicoCrescente;
    poderComAscensao = clampFinito(poderComAscensao * multiplicadorMunicoTotal);

    let power = poderComAscensao * (sup / 100);
    power = clampFinito(power);

    // 😮‍💨 Fadiga de Combate — calcularFadigaAtual (core/fadiga.js) é a única fonte de verdade
    // pra este número, compartilhada com Ficha Def/Marcados.jsx, pra o Poder exibido no Mapa
    // nunca divergir do Poder exibido na Ficha.
    const fadigaAtual = calcularFadigaAtual(ficha);
    power = power * (1 - fadigaAtual / 100);
    power = clampFinito(power);

    const divisorIndividual = parseFloat(ficha.divisorPoder);
    const divisorMesaSeguro = parseFloat(divisorPoderMesa);
    const divisorEfetivo = (!isNaN(divisorIndividual) && divisorIndividual > 0)
        ? divisorIndividual
        : ((!isNaN(divisorMesaSeguro) && divisorMesaSeguro > 0) ? divisorMesaSeguro : 1);
    power = power / divisorEfetivo;
    power = clampFinito(power);

    let strVal = String(Math.floor(power));
    let digitos = strVal.length;
    if (strVal.includes('e')) {
        let parts = strVal.split('e');
        let exponent = parseInt(parts[1].replace('+', ''));
        if (!isNaN(exponent)) digitos = exponent + 1;
    }
    return { poderGlobal: Math.floor(power), vitalidadeGlobal: Math.max(0, digitos - 8), supressao: sup, limiteSupressao: lim, temaScouter: tema };
}
