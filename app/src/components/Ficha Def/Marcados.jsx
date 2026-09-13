import React, { useState, useEffect, useMemo, useRef } from 'react';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, salvarFirebaseImediato, salvarDivisorPoderMesa } from '../../services/firebase-sync';
import { lerImagemComoBase64 } from '../../services/firebase-storage';

// Importação flexível
import * as AtributosCore from '../../core/attributes';
import { getRank } from '../../core/prestige';
import { formatarPoderCosmico } from '../../core/utils.js';
import { resolverEfeitosEntidade } from '../../core/efeitos-resolver';
import { calcularFadigaAtual } from '../../core/fadiga';
import { getFracaoDominio, calcularReducaoDanoElemental } from '../../core/dominios';
import { calcularBarrasVida, aplicarEdicaoBarraVida, getTetoVida } from '../../core/vitals';

import ClassificacaoPanel from './ClassificacaoPanel';
import RelicarioPanel from './RelicarioPanel';
import PactosPanel from './PactosPanel';
import BarrasVida from '../shared/BarrasVida';

// ==========================================
// 🛡️ DADOS DO COMPÊNDIO E FUNÇÕES SEGURAS
// ==========================================
function safeGetRawBase(f, k) { return typeof AtributosCore.getRawBase === 'function' ? AtributosCore.getRawBase(f, k) : parseFloat(f?.[k]?.base) || 0; }
function safeGetBuffs(f, k, t, ignorarPoderes = false) { return typeof AtributosCore.getBuffs === 'function' ? AtributosCore.getBuffs(f, k, t, false, ignorarPoderes) : {}; }

function safeGetMaximo(ficha, key) {
    try {
        if (AtributosCore && typeof AtributosCore.getMaximo === 'function') {
            const val = AtributosCore.getMaximo(ficha, key);
            return isNaN(val) ? 0 : val;
        }
    } catch (e) { console.warn("Aviso: getMaximo falhou internamente."); }
    return parseFloat(ficha?.[key]?.base) || 0;
}

// Réplica de safeGetMaximo, só que com o multiplicador de Formas travado fora — decide SÓ a
// escala de notação (calcularBarrasVida, core/vitals.js), nunca o numerador exibido, pra uma
// Forma temporária nunca "pular" de notação e parecer que a energia caiu (ver core/vitals.js >
// getMaximoSemFormas).
function safeGetMaximoSemFormas(ficha, key) {
    try {
        if (AtributosCore && typeof AtributosCore.getMaximoSemFormas === 'function') {
            const val = AtributosCore.getMaximoSemFormas(ficha, key);
            return isNaN(val) ? 0 : val;
        }
    } catch (e) { console.warn("Aviso: getMaximoSemFormas falhou internamente."); }
    return safeGetMaximo(ficha, key);
}

// 🔥 Base + buffs ADITIVOS (sem a pilha de multiplicadores mBase/mGeral/mFormas/mAbsoluto/mUnico).
function safeGetEfetivoBase(ficha, key, ignorarPoderes = false) {
    try {
        if (AtributosCore && typeof AtributosCore.getEfetivoBase === 'function') {
            const buffsCache = ignorarPoderes ? AtributosCore.getBuffs(ficha, key, false, false, true) : null;
            const val = AtributosCore.getEfetivoBase(ficha, key, false, buffsCache);
            return isNaN(val) ? 0 : val;
        }
    } catch (e) { console.warn("Aviso: getEfetivoBase falhou internamente."); }
    return parseFloat(ficha?.[key]?.base) || 0;
}

function safeGetRank(prest, asc) {
    try {
        const r = typeof getRank === 'function' ? getRank(prest, asc) : null;
        if (r && typeof r === 'object') return { ...r };
        return { l: 'F', c: '#ffffff', a: isNaN(asc) ? 1 : asc };
    } catch (e) {
        return { l: 'F', c: '#ffffff', a: isNaN(asc) ? 1 : asc };
    }
}

function getEfetivoMFormas(ficha, k, ignorarPoderes = false) {
    const anchor = k === 'status' ? 'forca' : k;
    let s = ficha?.[anchor] || {};
    let b = safeGetBuffs(ficha, anchor, true, ignorarPoderes) || {};
    let v = parseFloat(s.mFormas) || 1.0;
    if (!b._hasBuff || !b._hasBuff.mformas) return v;
    return (v === 1.0 ? 0 : v) + b.mformas;
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

        let b = safeGetBuffs(ficha, 'dano', true, true) || {};
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

        // 🔮 Relicário — Passivas/Runas POR ESTADO da Arma Espiritual (Base, Forma Verdadeira,
        // Fantasma Nobre; ver Ficha Def/RelicarioPanel.jsx, Capítulo 2): só contam enquanto a Arma
        // Espiritual estiver EQUIPADA (arma.equipada !== false -- campo ausente em fichas antigas
        // conta como equipada, pra nunca mudar o comportamento de quem já tinha a arma valendo antes
        // desta trava existir; ver botão "Equipar/Desequipar" no Altar da Relíquia, Capítulo 1). Os
        // três estados são EXCLUDENTES (pedido do usuário): só as Passivas/Runas do estado ATIVO
        // (armaEsp.estadoAtivo) contam -- ativar a Forma Verdadeira desliga as do Base, ativar o
        // Fantasma Nobre desliga as de Base e Verdadeira. Se o acesso ao estado selecionado for
        // revogado pelo Mestre depois (acessoVerdadeira/acessoFantasma), o cálculo cai um nível
        // sozinho em vez de continuar contando um estado sem acesso. Enquanto equipada, sempre
        // "ativas" (documentam a arma permanente da entidade, sem toggle "ativo" próprio por item
        // como Poderes/Itens têm) — mesma convenção de tags MBASE/MGERAL/MFORMAS/MABS/MUNICO já usada
        // em Poderes/Habilidades/Transformações/Magias/Itens, lida do campo "texto" de cada item.
        const armaEsp = ficha.armaEspiritual || {};
        if (armaEsp.equipada !== false) {
            const acessoVerdadeira = armaEsp.acessoVerdadeira !== false;
            const acessoFantasma = !!armaEsp.acessoFantasma;
            let estadoEfetivo = armaEsp.estadoAtivo || 'base';
            if (estadoEfetivo === 'fantasma' && !acessoFantasma) estadoEfetivo = 'verdadeira';
            if (estadoEfetivo === 'verdadeira' && !acessoVerdadeira) estadoEfetivo = 'base';

            const CAMPOS_POR_ESTADO = {
                base: [['passivas', 'Passiva da Relíquia'], ['runas', 'Runa']],
                verdadeira: [['passivasVerdadeira', 'Passiva da Forma Verdadeira'], ['runasVerdadeira', 'Runa da Forma Verdadeira']],
                fantasma: [['passivasFantasma', 'Passiva do Fantasma Nobre'], ['runasFantasma', 'Runa do Fantasma Nobre']]
            };
            (CAMPOS_POR_ESTADO[estadoEfetivo] || CAMPOS_POR_ESTADO.base).forEach(([campo, rotulo]) => {
                (armaEsp[campo] || []).forEach((item, i) => {
                    if (!item || !item.texto) return;
                    const nomeItem = `${rotulo} #${i + 1}`.toUpperCase();
                    const regex = /(MBASE|MGERAL|MFORMAS|MABS|MUNICO)\s*:\s*\+?\s*(-?\d+(?:[.,]\d+)?)/gi;
                    let match;
                    while ((match = regex.exec(item.texto)) !== null) {
                        const tipo = match[1].toUpperCase();
                        const val = parseFloat(match[2].replace(',', '.'));
                        if (isNaN(val)) continue;
                        if (tipo === 'MUNICO') { if (val > 0) unicos.push(val); }
                        else if (grupos[tipo]) grupos[tipo][nomeItem] = (grupos[tipo][nomeItem] || 0) + val;
                    }
                });
            });
        }

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
        // separadamente em poderGlobal, no MESMO estágio (pós-injeção de Ascensão)
        // que multiplicadorPoderDireto (mUnicos de Poderes/poder_direto) e
        // multiplicadorMunicoCrescente (mUnico Crescente por turno). Isso garante
        // que TODO mUnico — não importa a fonte (Balança de Adaptação, buffs,
        // texto de habilidades, Poderes ou mUnico Crescente) — sempre multiplica
        // com qualquer outro mUnico, sem ser diluído pela injeção aditiva de
        // Ascensão que fica no meio do caminho (ver getMunicoCrescenteMultiplier).
        return { finalB, finalG, finalF, finalA, finalUni, totalDano: finalB * finalG * finalA };
    } catch(e) {
        return { finalB: 1, finalG: 1, finalF: 1, finalA: 1, finalUni: 1, totalDano: 1 };
    }
}

function getPoderDiretoMultiplier(ficha) {
    if (!ficha) return 1;
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

        (ficha.poderes || []).forEach(p => {
            if (!p) return;
            const resolved = resolverEfeitosEntidade(p);
            if (p.ativa) processar(resolved.efeitos);
            processar(resolved.efeitosPassivos);
        });

        // 🔥 Pactos/Entidades Seladas (ficha.seresSelados) também podem carregar um
        // efeito "poder_direto" — só conta enquanto o Pacto estiver Sincronizado
        // (ser.ativo), igual a todo o resto dos buffs dele (ver core/attributes.js).
        (ficha.seresSelados || []).forEach(ser => {
            if (!ser || !ser.ativo) return;
            const resolved = resolverEfeitosEntidade(ser);
            processar(resolved.efeitos);
            processar(resolved.efeitosPassivos);
        });

        let finalUni = 1.0;
        unicos.forEach(n => { finalUni *= n; });

        return (1 + grupos.mbase) * (1 + grupos.mgeral) * (1 + grupos.mformas) * (1 + grupos.mabs) * finalUni;
    } catch (e) {
        return 1;
    }
}

// ♾️ mUnico Crescente (Infinities tipo Adaptação): cresce automaticamente a cada
// turno de combate (mesmo padrão de contador da Fadiga, só que aumenta o Poder em
// vez de reduzir). Ver "Marcadores & Adaptação" > mUnico Crescente.
//
// 🔥 mUnico SEMPRE multiplica mUnico — nunca soma. Por isso este multiplicador NÃO
// entra no array `unicos` de getGlobalMultipliers() (que alimenta glob.totalDano,
// consumido ANTES da injeção aditiva de Ascensão via magnitude de log10 em
// poderGlobal). Ficando ali, o efeito multiplicativo era "diluído" pela injeção de
// Ascensão que vem logo depois, e ficava pouco visível ao lado de mUnicos passivos
// vindos de Poderes (poder_direto), que já multiplicam DEPOIS dessa injeção via
// multiplicadorPoderDireto. Aplicando junto de multiplicadorPoderDireto (mesmo
// estágio do pipeline), os dois voltam a multiplicar entre si de verdade.
function getMunicoCrescenteMultiplier(ficha) {
    const turnos = Math.max(0, Number(ficha?.combate?.municoTurnos) || 0);
    if (turnos <= 0) return 1;
    const taxaBruta = Number(ficha?.combate?.municoPorTurno);
    const taxa = isNaN(taxaBruta) ? 5 : taxaBruta;
    return Math.max(1, 1 + (turnos * taxa / 100));
}

function getPoderAbsolutoAtributo(key, ficha) {
    if (!ficha) return 0;
    const mults = { vida: 1000000, mana: 10000000, aura: 10000000, chakra: 10000000, corpo: 10000000, forca: 1000, destreza: 1000, inteligencia: 1000, sabedoria: 1000, energiaEsp: 1000, carisma: 1000, stamina: 1000, constituicao: 1000, energiaForca: 10000000, status: 1000 };
    
    const rawBase = parseFloat(ficha?.[key]?.base) || 0;
    const isStatus = !['vida', 'mana', 'aura', 'chakra', 'corpo', 'energiaForca', 'status'].includes(key);
    const kDiv = isStatus ? 'status' : key;
    const div = parseFloat(ficha?.divisores?.[kDiv]) || 1;
    
    let prestigioBruto = 0;
    if (key === 'status') {
        let m = 0;
        ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'].forEach(s => {
            m += parseFloat(ficha?.[s]?.base) || 0;
        });
        prestigioBruto = Math.floor(((m / 8) / mults.status) * div) || 0;
    } else {
        prestigioBruto = Math.floor((rawBase / (mults[key] || 1)) * div) || 0;
    }
    
    const ascensaoBase = parseInt(ficha?.ascensaoBase) || 1;
    const multP = parseFloat(ficha?.multiplicadorForcaPrestigio) || 1;
    const multA = parseFloat(ficha?.multiplicadorForcaAscensao) || 1;

    const { prestigioFinal, ascensaoFinal } = aplicarMultiplicadorForca(prestigioBruto, ascensaoBase, multP, multA);
    const pontosTotais = (ascensaoFinal * 100) + prestigioFinal;

    let poderPuro = Math.floor((pontosTotais / div) * (mults[key] || 1));

    if (isStatus) {
        let prestIndiv = Math.floor((rawBase / mults[key]) * div) || 0;
        const { prestigioFinal: prestIndivFinal, ascensaoFinal: ascIndivFinal } = aplicarMultiplicadorForca(prestIndiv, ascensaoBase, multP, multA);
        let pontosTotaisIndiv = (ascIndivFinal * 100) + prestIndivFinal;
        poderPuro = Math.floor((pontosTotaisIndiv / div) * mults[key]);
    }

    return isNaN(poderPuro) ? 0 : poderPuro;
}

function getPoderVerdadeiro(key, ficha, isAtual, supressao = 100, fator = 1) {
    try {
        if (!ficha || !key) return 0;
        const f = parseFloat(fator) || 1;
        let poderBase = getPoderAbsolutoAtributo(key, ficha) * f;

        let mF = 1;
        if (isAtual) {
            mF = getEfetivoMFormas(ficha, key);
            if (isNaN(mF) || mF < 1) mF = 1;
        }

        let sup = parseFloat(supressao);
        if (isNaN(sup)) sup = 100;

        let power = poderBase * mF * (sup / 100);
        return isNaN(power) ? 0 : Math.floor(power);
    } catch (e) {
        return 0;
    }
}

function getTemaScouter(supressao, limite = 1) {
    if (supressao >= 100) return { cor: '#ffcc00', glow: '#ff8800', nome: 'Poder Máximo (Liberto)', pulse: '0.8s' };
    if (supressao >= 50)  return { cor: '#00e5ff', glow: '#0088ff', nome: 'Supressão Leve (Restrito)', pulse: '1.5s' };
    if (supressao >= 10)  return { cor: '#b142ff', glow: '#6a00ff', nome: 'Ocultação Profunda', pulse: '3s' };
    if (supressao > limite) return { cor: '#00ff66', glow: '#00aa44', nome: 'Furtividade Extrema', pulse: '5s' };
    return { cor: '#ff003c', glow: '#880000', nome: 'Anulação no Limite', pulse: '8s' };
}

const CLASSES_REGULARES_BASE = [ { id: 'saber', nome: 'Saber', icone: '⚔️', cor: '#0088ff' }, { id: 'archer', nome: 'Archer', icone: '🏹', cor: '#ff003c' }, { id: 'lancer', nome: 'Lancer', icone: '🗡️', cor: '#00ffcc' }, { id: 'rider', nome: 'Rider', icone: '🏇', cor: '#ff8800' }, { id: 'caster', nome: 'Caster', icone: '🧙‍♂️', cor: '#cc00ff' }, { id: 'assassin', nome: 'Assassin', icone: '🔪', cor: '#444444' }, { id: 'berserker', nome: 'Berserker', icone: '狂', cor: '#ff0000' } ];
const CLASSES_EXTRA_BASE = [ { id: 'shielder', nome: 'Shielder', icone: '🛡️', cor: '#00ffff' }, { id: 'ruler', nome: 'Ruler', icone: '⚖️', cor: '#ffcc00' }, { id: 'avenger', nome: 'Avenger', icone: '⛓️', cor: '#880000' }, { id: 'alterego', nome: 'Alter Ego', icone: '🎭', cor: '#ff00ff' }, { id: 'foreigner', nome: 'Foreigner', icone: '🐙', cor: '#00ff88' }, { id: 'mooncancer', nome: 'Moon Cancer', icone: '🌕', cor: '#8888aa' }, { id: 'pretender', nome: 'Pretender', icone: '🤥', cor: '#ffaa00' }, { id: 'beast', nome: 'Beast', icone: '👹', cor: '#4a0000' }, { id: 'savior', nome: 'Savior', icone: '☀️', cor: '#ffffff' }, { id: 'desconhecido', nome: '?', icone: '👤', cor: '#666666' } ];

// 🔥 Opções canônicas de Classe Mística pro <select> — precisam bater exatamente com os ids usados
// em core/classIcons.js e no cálculo de bônus (core/attributes.js), senão o ícone no Mapa e o
// bônus no Poder Calculado somem silenciosamente. Um campo de texto livre já causou esse bug.
const CLASSE_SELECT_OPTIONS = [
    { id: '', nome: 'Nenhuma / Mundano', icone: '' },
    ...CLASSES_REGULARES_BASE, ...CLASSES_EXTRA_BASE.filter(c => c.id !== 'desconhecido')
];

function getClasseInfo(ficha) {
    const nomeClasse = ficha?.bio?.classe;
    if (!nomeClasse) return null;
    const normalizar = (txt) => String(txt).replace(/[^a-z0-9]/gi, '').toLowerCase();
    const nomeStr = normalizar(nomeClasse);
    const todasClasses = [...CLASSES_REGULARES_BASE, ...CLASSES_EXTRA_BASE];
    const overrides = ficha?.compendioOverrides?.classes || {};
    const overrideMatch = Object.values(overrides).find(c => !c.deletado && c.nome && normalizar(c.nome) === nomeStr);
    if (overrideMatch) return overrideMatch;
    return todasClasses.find(c => normalizar(c.nome) === nomeStr) || null;
}

const NIVEIS_DOMINIO = {
    1: { nome: "Básico", cor: "#44ff44", desc: "+10% Dano Mágico" },
    2: { nome: "Intermediário", cor: "#44ff44", desc: "+25% Dano | -5% Custo" },
    3: { nome: "Avançado", cor: "#44ff44", desc: "+50% Dano | -10% Custo" },
    4: { nome: "Virtuoso", cor: "#0088ff", desc: "Dano x2 | Ignora Resistências Menores" },
    5: { nome: "Maestria", cor: "#0088ff", desc: "Dano x3.5 | -25% Custo | -50% Dano Sofrido" },
    6: { nome: "Perfeito", cor: "#0088ff", desc: "Dano x6 | Imunidade Total | Incancelável" },
    7: { nome: "Molecular", cor: "#aa00ff", desc: "Dano x10 | Ignora Imunidades | Dano Persistente" },
    8: { nome: "Atômico", cor: "#aa00ff", desc: "Dano x50 | -50% Custo | Desintegração de Armadura" },
    9: { nome: "Absoluto", cor: "#ff003c", desc: "Dano x100 | Custo ZERO | Silenciamento de Elemento" },
    10: { nome: "Eterno", cor: "#ffcc00", desc: "Dano Incalculável | Apagamento Conceitual" }
};

const CATEGORIAS_DOMINIO = {
    'elementos_basicos': { titulo: 'Elementos Básicos', icone: '🔥', cor: '#ff6600' },
    'elementos_basicos_verdadeiros': { titulo: 'Básicos Verdadeiros', icone: '🌋', cor: '#ff3300' },
    'elementos_avancados': { titulo: 'Elementos Avançados', icone: '☄️', cor: '#ffaa00' },
    'elementos_avancados_verdadeiros': { titulo: 'Avançados Verdadeiros', icone: '☀️', cor: '#ffcc00' },
    'mana': { titulo: 'Artes de Mana (Grimório)', icone: '🔮', cor: '#0088ff' },
    'chakra': { titulo: 'Artes de Chakra (Shinobi)', icone: '🌀', cor: '#00ffcc' },
    'aura': { titulo: 'Artes de Aura (Manifestação)', icone: '✨', cor: '#ff00ff' },
    'primordiais': { titulo: 'Artes Primordiais Cósmicas', icone: '🌌', cor: '#aa00ff' },
    'astral': { titulo: 'Artes Astrais (Vida/Morte)', icone: '👁️', cor: '#ffffff' },
    'marciais': { titulo: 'Artes Marciais (Taijutsu)', icone: '🥋', cor: '#ff3333' },
    'armas': { titulo: 'Maestria de Armas (Kenjutsu)', icone: '⚔️', cor: '#aaaaaa' },
    'cura': { titulo: 'Atributos de Cura e Suporte', icone: '💚', cor: '#00ff00' },
    'summons': { titulo: 'Contratos & Invocações', icone: '👹', cor: '#ffcc00' }
};

const PREDEFINIDOS_LORE = {
    elementos_basicos: [ { label: "Elementos Básicos", itens: ["Fogo", "Raio", "Agua", "Vento", "Terra"] } ],
    elementos_basicos_verdadeiros: [ { label: "Básicos Verdadeiros", itens: ["Fogo Verdadeiro", "Raio Verdadeiro", "Agua Verdadeira", "Vento Verdadeiro", "Terra Verdadeira"] } ],
    elementos_avancados: [ { label: "Elementos Avançados", itens: ["Solar", "Energia", "Gelo", "Vacuo", "Natureza"] } ],
    elementos_avancados_verdadeiros: [ { label: "Avançados Verdadeiros", itens: ["Solar Verdadeiro", "Energia Verdadeira", "Gelo Verdadeiro", "Vacuo Verdadeiro", "Natureza Verdadeira"] } ],
    mana: [ { label: "Magias de Ciclo", itens: ["Truques de Ciclo", "Magias de 1º a 10º Ciclo"] }, { label: "Magias Arcanas/Negras", itens: ["Truques Arcanos/Negros", "Magias Arcanas/Negra de 1º a 10º Ciclo"] }, { label: "Magias Ancestrais", itens: ["Truques Ancestrais", "Magia de Sangue", "Magia de Osso", "Magia Draconica", "Magia de Alma", "Magia de Tempo", "Magia de Gravidade", "Magia Espacial", "Magia de Borracha", "Magia de Espelho", "Magia de Sal", "Magia de Tremor", "Magia de Equipamento", "Magia de Explosao", "Magia de Metamorfose"] } ],
    chakra: [ { label: "Kekkei Genkai", itens: ["Elemento Madeira", "Elemento Mineral", "Elemento Cinzas", "Elemento Igneo", "Elemento Lava", "Elemento Vapor", "Elemento Nevoa", "Elemento Tempestade", "Elemento Areia", "Elemento Tufao"] }, { label: "Kekkei Touta", itens: ["Elemento Velocidade", "Elemento Poeira", "Elemento Veneno", "Elemento Cal", "Elemento Carbono", "Elemento Calor", "Elemento Som", "Elemento Magnetismo"] } ],
    aura: [ { label: "Manifestação", itens: ["Aura Pura", "Projeção de Aura", "Reforço de Aura"] }, { label: "Fusões", itens: ["Fusões Básicas", "Fusões Avançadas"] } ],
    primordiais: [ { label: "Primordiais Base", itens: ["Luz", "Trevas", "Ether"] }, { label: "Primordiais Verdadeiros", itens: ["Celestial", "Infernal", "Caos"] }, { label: "Absolutos", itens: ["Criacao", "Destruicao", "Cosmos"] } ],
    astral: [ { label: "Domínios da Existência", itens: ["Vida", "Morte", "Vazio", "Neutro", "Energia Astral"] } ],
    marciais: [ { label: "Fundamentos", itens: ["Artes Marciais (Combate Corpo-a-Corpo)", "Reforço Físico"] }, { label: "Estilos de Combate", itens: ["Punho do Dragão", "Palma Suave", "Caminho do Tigre", "Boxe Demoníaco", "Artes de Assassino", "Estilo Bêbado", "Punho de Ferro"] } ],
    armas: [ { label: "Kenjutsu (Espadas)", itens: ["Ittouryu (1 Espada)", "Nitouryu (2 Espadas)", "Santouryu (3 Espadas)", "Iaido", "Kenjutsu"] }, { label: "Posturas de Combate", itens: ["Postura da Montanha", "Postura da Água", "Postura do Vento", "Postura do Trovão"] }, { label: "Outras Armas", itens: ["Maestria com Lança", "Maestria com Foice", "Maestria com Arco", "Maestria com Armas de Fogo", "Maestria com Escudo"] } ],
    cura: [ { label: "Medicina", itens: ["Regeneração Básica", "Cura Celular", "Purificação", "Reversão Temporal", "Transferência Vital", "Ressurreição Limitada"] } ],
    summons: [ { label: "Pactos", itens: ["Pacto Demoníaco", "Feras Divinas", "Espíritos Ancestrais", "Contrato Dracônico", "Exército de Sombras", "Invocação de Armamento Sagrado"] } ]
};

function encontrarCategoriaPorLore(nome) {
    const nomeClean = String(nome || '').trim().toLowerCase();
    for (const [catKey, grupos] of Object.entries(PREDEFINIDOS_LORE)) {
        for (const grupo of grupos) {
            if (grupo.itens.some(item => item.trim().toLowerCase() === nomeClean)) return catKey;
        }
    }
    return null;
}

export function getCamadasTinta(cor) {
    if (!cor || cor === '#ffffff' || cor === 'transparent') return null;
    return { modo1: 'color', op1: 0.85, modo2: 'multiply', op2: 0.5 };
}

// ==========================================
// 🛡️ FUNÇÕES AUXILIARES DA TABELA
// ==========================================
function getBasePFor(ficha, k) {
    const mults = { vida: 1000000, mana: 10000000, aura: 10000000, chakra: 10000000, corpo: 10000000, status: 1000 };
    const div = parseFloat(ficha?.divisores?.[k]) || 1;
    if (k === 'status') {
        let m = 0;
        ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'].forEach(s => { m += safeGetRawBase(ficha, s); });
        return Math.floor(((m / 8) / mults.status) * div) || 0;
    }
    return Math.floor((safeGetRawBase(ficha, k) / (mults[k] || 1)) * div) || 0;
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

function calcularPrestAtual(ficha, attrKey, baseP, ignorarPoderes = false) {
    const mFormas = getEfetivoMFormas(ficha, attrKey, ignorarPoderes);
    const multForma = mFormas >= 10 ? (mFormas / 10) : (mFormas > 1 ? mFormas : 1);
    return Math.floor((baseP || 0) * multForma) || 0;
}

function getPontosParaAscensao(ficha, key) {
    if (key === 'status') return parseFloat(ficha?.statusPrestigioAplicado) || 0;
    return getBasePFor(ficha, key);
}

let globalTimer = null;
function callSave(fn) {
    if (globalTimer) clearTimeout(globalTimer);
    globalTimer = setTimeout(() => {
        if (typeof salvarFirebaseImediato === 'function') salvarFirebaseImediato();
        else if (typeof salvarFichaSilencioso === 'function') salvarFichaSilencioso();
        if(fn) fn();
    }, 400);
}

let divisorPoderMesaTimer = null;

// ==========================================
// 🖋️ COMPONENTES ISOLADOS (BLINDADOS)
// ==========================================
const CampoMagico = ({ valor, onChange, placeholder, styleExtra = {}, type = "text", isNumber = false, onFocusChange, displayOverride }) => {
    const [focused, setFocused] = useState(false);
    const handleChange = (e) => {
        let val = e.target.value;
        if (isNumber && val !== '') {
            val = val.replace(',', '.');
            let num = Number(val);
            if (!isNaN(num)) val = num; else val = 0;
        }
        onChange(val);
    };
    
    let displayValue = displayOverride !== undefined && displayOverride !== '' ? displayOverride : (valor !== undefined && valor !== null ? String(valor) : '');
    let currentType = type;
    if (isNumber && !focused && displayValue !== '' && displayOverride === undefined) {
        let num = Number(displayValue);
        if (!isNaN(num)) displayValue = num.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
        currentType = 'text';
    } else if (isNumber && focused) { currentType = 'number'; }

    return (
        <input type={currentType} step={isNumber ? "any" : undefined} value={displayValue} onChange={handleChange}
            onFocus={() => { setFocused(true); if (onFocusChange) onFocusChange(true); }}
            onBlur={() => { setFocused(false); if (onFocusChange) onFocusChange(false); callSave(); }}
            placeholder={placeholder}
            style={{ background: 'transparent', border: 'none', borderBottom: '1px dashed currentColor', fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', fontWeight: 'inherit', fontStyle: 'inherit', outline: 'none', padding: '0 5px', width: '100px', ...styleExtra }}
        />
    );
};

const LabelMagico = ({ valor, onChange, fallback }) => (
    <input type="text" value={valor !== undefined ? valor : fallback} onChange={(e) => onChange(e.target.value)} 
        onBlur={(e) => { e.target.style.borderBottom = '1px solid transparent'; callSave(); }}
        size={Math.max(String(valor !== undefined ? valor : fallback).length, 3)}
        style={{ background: 'transparent', border: 'none', borderBottom: '1px solid transparent', fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', fontWeight: 'bold', fontStyle: 'italic', outline: 'none', padding: '0', cursor: 'text', transition: '0.2s' }}
        onFocus={(e) => e.target.style.borderBottom = '1px dashed currentColor'} 
    />
);

const LinhaAtributoCru = ({ labelKey, fallbackLabel, attrKey, isAtual, ficha, getLabel, setLabel, salvar, fator, attrBaseFocado, setAttrBaseFocado, poolDisponivel = 0, onAlocarPool, poolGastoDisponivel = 0, onDevolverPool }) => {
    const [qtdAlocar, setQtdAlocar] = useState(1);
    const [qtdDevolver, setQtdDevolver] = useState(1);
    const baseValRaw = ficha[attrKey]?.base;
    const rawBase = parseFloat(baseValRaw) || 0;
    let maxVal = parseFloat(safeGetMaximo(ficha, attrKey)) || 0;
    const fatorSeguro = parseFloat(fator) || 1;
    const baseExibido = (baseValRaw === undefined || baseValRaw === null || baseValRaw === '') ? '' : Math.floor(rawBase * fatorSeguro);
    const valorAtual = Math.floor(maxVal * fatorSeguro);
    const editandoBase = attrBaseFocado === attrKey;
    const valorCampoBase = editandoBase ? (baseValRaw ?? '') : baseExibido;

    let supressao = ficha?.supressaoPoder !== undefined ? Number(ficha.supressaoPoder) : 100;
    if (isNaN(supressao)) supressao = 100;
    let limiteSupressao = ficha?.limiteSupressao !== undefined ? Number(ficha.limiteSupressao) : 1;
    if (isNaN(limiteSupressao)) limiteSupressao = 1;
    if (supressao < limiteSupressao) supressao = limiteSupressao;
    
    const tema = getTemaScouter(supressao, limiteSupressao);
    const poderVerdadeiro = getPoderVerdadeiro(attrKey, ficha, isAtual, supressao);

    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dotted currentColor', padding: '6px 0', fontSize: '1.1em', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <LabelMagico valor={getLabel(labelKey, fallbackLabel)} onChange={(v) => setLabel(labelKey, v)} />
                <span style={{ fontSize: '0.7em', color: '#fff', border: `1px solid ${tema.cor}`, padding: '2px 6px', borderRadius: '10px', background: 'rgba(0,0,0,0.5)', whiteSpace: 'nowrap', fontWeight: 'bold', textShadow: `0 0 5px ${tema.glow}`, boxShadow: `inset 0 0 5px ${tema.cor}80` }}>
                    Poder: {formatarPoderCosmico(Number(poderVerdadeiro) || 0)}
                </span>
            </div>
            {isAtual ? <span style={{ fontWeight: 'bold' }}>{Number(valorAtual).toLocaleString('pt-BR')}</span> : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <CampoMagico valor={valorCampoBase} onChange={(v) => salvar(`${attrKey}.base`, v)} onFocusChange={(focado) => setAttrBaseFocado(focado ? attrKey : null)} styleExtra={{ width: '100px', textAlign: 'right', fontWeight: 'bold' }} type="number" isNumber={true} />
                    {onAlocarPool && poolDisponivel > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7em', opacity: 0.85 }} title={`Pool de Status disponível: ${poolDisponivel}`}>
                            <input type="number" min="1" max={poolDisponivel} value={qtdAlocar}
                                onChange={(e) => setQtdAlocar(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') onAlocarPool(attrKey, qtdAlocar); }}
                                style={{ width: '45px', background: 'rgba(0,0,0,0.15)', border: '1px solid currentColor', borderRadius: '3px', color: 'inherit', textAlign: 'center', padding: '1px 2px' }} />
                            <button type="button" onClick={() => setQtdAlocar(poolDisponivel)}
                                style={{ background: 'rgba(0,255,150,0.08)', border: '1px dashed currentColor', borderRadius: '3px', cursor: 'pointer', color: 'inherit', opacity: 0.85, padding: '1px 5px' }}
                                title="Preencher com todo o pool disponível">Máx</button>
                            <button type="button" onClick={() => onAlocarPool(attrKey, qtdAlocar)}
                                style={{ background: 'rgba(0,255,150,0.15)', border: '1px solid currentColor', borderRadius: '3px', cursor: 'pointer', color: 'inherit', fontWeight: 'bold', padding: '1px 6px' }}
                                title="Distribuir pontos do pool de Status para este atributo (Enter também funciona)">+ Pool</button>
                        </span>
                    )}
                    {onDevolverPool && poolGastoDisponivel > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7em', opacity: 0.85 }} title={`Total já distribuído pelo pool (pode devolver até): ${poolGastoDisponivel}`}>
                            <input type="number" min="1" max={poolGastoDisponivel} value={qtdDevolver}
                                onChange={(e) => setQtdDevolver(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') onDevolverPool(attrKey, qtdDevolver); }}
                                style={{ width: '45px', background: 'rgba(0,0,0,0.15)', border: '1px solid currentColor', borderRadius: '3px', color: 'inherit', textAlign: 'center', padding: '1px 2px' }} />
                            <button type="button" onClick={() => onDevolverPool(attrKey, qtdDevolver)}
                                style={{ background: 'rgba(255,80,80,0.12)', border: '1px solid currentColor', borderRadius: '3px', cursor: 'pointer', color: 'inherit', fontWeight: 'bold', padding: '1px 6px' }}
                                title="Devolver pontos deste atributo para o pool de Status (Enter também funciona) — facilita reverter uma alocação">− Pool</button>
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

const BarraVital = ({ atual, maximo, pVit, cor, corTexto = "#fff", onChangeAtual }) => {
    let maxSafe = Number(maximo) || 0;
    let atSafe = Number(atual) || 0;
    const pct = maxSafe > 0 ? Math.min(100, Math.max(0, (atSafe / maxSafe) * 100)) : 0;
    const isDark = corTexto === '#fff';
    return (
        <div style={{ position: 'relative', width: '100%', height: '35px', border: '2px solid currentColor', borderRadius: '6px', background: 'rgba(255,255,255,0.2)', overflow: 'hidden', marginTop: '5px', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)', display: 'flex' }}>
            {pVit > 0 && <div style={{ width: '35px', height: '100%', background: 'rgba(0,0,0,0.9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2em', borderRight: '2px solid rgba(0,0,0,0.8)', zIndex: 5, boxShadow: `inset 0 0 10px ${cor}` }}>{pVit}</div>}
            <div style={{ flex: 1, position: 'relative' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: cor, transition: 'width 0.3s ease' }} />
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2em', color: corTexto, textShadow: isDark ? '1px 1px 3px #000, -1px -1px 3px #000' : 'none' }}>
                    <CampoMagico valor={atSafe} onChange={onChangeAtual} isNumber={true} styleExtra={{ width: '120px', textAlign: 'right', color: corTexto, textShadow: 'inherit', borderBottom: `1px dashed ${isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'}` }} />
                    <span style={{ margin: '0 8px' }}>/</span>
                    <span>{maxSafe.toLocaleString('pt-BR')}</span>
                </div>
            </div>
        </div>
    );
};

// 🔥 RADAR DESENHADO 🔥
const RadarDesenhado = ({ ficha, isAtual, corTinta = "#000000", fator = 1 }) => {
    const eixos = [ { label: 'VIDA', key: 'vida' }, { label: 'MANA', key: 'mana' }, { label: 'AURA', key: 'aura' }, { label: 'CHAKRA', key: 'chakra' }, { label: 'CORPO', key: 'corpo' }, { label: 'STATUS', key: 'status' } ];
    const angulos = Array.from({length: 6}).map((_, i) => Math.PI * 2 * i / 6 - Math.PI / 2);
    
    const ascensao = parseInt(ficha?.ascensaoBase) || 1;
    const multP = parseFloat(ficha?.multiplicadorForcaPrestigio) || 1;
    const multA = parseFloat(ficha?.multiplicadorForcaAscensao) || 1;
    
    const rankInfos = [];
    const dataPoints = eixos.map((e, i) => {
        const displayP = getPontosParaAscensao(ficha, e.key);
        
        let mF = 1;
        if (isAtual) { mF = getEfetivoMFormas(ficha, e.key); if (isNaN(mF) || mF < 1) mF = 1; }
        const pAtualValor = Math.floor(displayP * mF);
        
        const efetivo = aplicarMultiplicadorForca(pAtualValor, ascensao, multP, multA);
        rankInfos.push(efetivo);

        let valNorm = parseFloat(efetivo.prestigioFinal) || 0;
        if (valNorm === 0 && Math.floor(efetivo.ascensaoFinal || 1) > 1) { valNorm = 100; } 
        else if (valNorm >= 100) { valNorm = valNorm % 100 === 0 ? 100 : valNorm % 100; }

        let frac = Math.min(Math.max(valNorm / 100, 0.05), 1);
        if (isNaN(frac)) frac = 0.05;
        
        let cx = 100 + 75 * frac * Math.cos(angulos[i]);
        let cy = 100 + 75 * frac * Math.sin(angulos[i]);
        if (isNaN(cx)) cx = 100;
        if (isNaN(cy)) cy = 100;

        return `${cx},${cy}`;
    }).join(' ');

    const hexToRgba = (hex, alpha) => {
        const r = parseInt(hex.slice(1, 3), 16) || 0;
        const g = parseInt(hex.slice(3, 5), 16) || 0;
        const b = parseInt(hex.slice(5, 7), 16) || 0;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    return (
        <svg viewBox="0 0 240 240" style={{ width: '100%', maxWidth: '340px', height: 'auto', overflow: 'visible', filter: 'drop-shadow(2px 2px 2px rgba(0,0,0,0.2))' }}>
            <g transform="translate(20, 20)">
                {[0.33, 0.66, 1.0].map((scale, i) => <polygon key={i} fill="none" stroke={hexToRgba(corTinta, 0.2)} strokeWidth="1" strokeDasharray="3" points={angulos.map(a => `${100 + 75 * scale * Math.cos(a)},${100 + 75 * scale * Math.sin(a)}`).join(' ')} />)}
                {angulos.map((a, i) => <line key={i} x1="100" y1="100" x2={100 + 75 * Math.cos(a)} y2={100 + 75 * Math.sin(a)} stroke={hexToRgba(corTinta, 0.2)} strokeWidth="1" strokeDasharray="3" />)}
                <polygon points={dataPoints} fill={hexToRgba(corTinta, isAtual ? 0.3 : 0.1)} stroke={corTinta} strokeWidth="2" strokeLinejoin="round" style={{ transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                {eixos.map((e, i) => {
                    const rk = rankInfos[i];
                    return (
                        <text key={i} x={100 + 105 * Math.cos(angulos[i])} y={100 + 105 * Math.sin(angulos[i])} textAnchor="middle" dominantBaseline="central" fill={rk.c} fontSize="11" fontWeight="bold" style={{ textShadow: `0 0 5px ${rk.c}`, fontStyle: 'italic', transition: 'fill 0.3s' }}>
                            [{rk.l}] A{Math.floor(rk.ascensaoFinal || 1)} {e.label}
                        </text>
                    );
                })}
            </g>
        </svg>
    );
};

const LinhaVital = ({ labelKey, fallbackLabel, vitalKey, subItens, corBarra, corTextoBarra = '#fff', ficha, supressao, temaScouter, salvar, getLabel, setLabel, fator = 1 }) => {
    const [aberto, setAberta] = useState(false);
    const fatorSeguro = parseFloat(fator) || 1;
    let rawMaximo = (parseFloat(safeGetMaximo(ficha, vitalKey)) || 0) * fatorSeguro;
    let rawMaximoEstavel = (parseFloat(safeGetMaximoSemFormas(ficha, vitalKey)) || 0) * fatorSeguro;

    // 🩸 MÚLTIPLAS BARRAS DE VIDA (pedido do usuário): a cada ponto de Vitalidade (p) o personagem
    // ganha mais uma barra CHEIA de Vida, do mesmo tamanho (mxDisplay) que as anteriores — só Vida
    // faz isso, as demais (mana/aura/chakra/corpo) continuam com 1 barra só. "atual" continua
    // sendo um ÚNICO número guardado na ficha — o TOTAL restante somando todas as barras — as
    // barras individuais são só DERIVADAS dele por calcularBarrasVida (core/vitals.js, ÚNICA fonte
    // de verdade dessa conta, reaproveitada por toda a Ficha/Mapa/Mestre): a barra da frente
    // (índice 0) esvazia primeiro, o excesso da mesma pancada transborda pra próxima.
    const { mxDisplay, p: pVit, numBarras, totalMax, atual: atualTotal, barras } = calcularBarrasVida(rawMaximo, vitalKey, ficha?.[vitalKey]?.atual, rawMaximoEstavel);

    const poderVerdadeiro = getPoderVerdadeiro(vitalKey, ficha, true, supressao);

    // 💖 Regeneração deste vital — mesmo campo manual (ficha[vitalKey].regeneracao) editado na aba
    // Ficha > Editor de Atributos, mais o bônus de Poderes/Passivas/Itens ativos (getBuffs, ver
    // core/vitals.js > aplicarRegeneracaoDeTurno) que realmente entra na conta a cada turno/clique
    // em "Regenerar". Trazido pra cá pra não precisar trocar de aba só pra ver/ajustar isso.
    const regenManual = parseFloat(ficha?.[vitalKey]?.regeneracao) || 0;
    const regenBuff = safeGetBuffs(ficha, vitalKey, false, false)?.regeneracao || 0;
    const regenTotal = regenManual + regenBuff;

    return (
        <div style={{ marginBottom: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '1.2em' }}>
                    {subItens && <span onClick={() => setAberta(!aberto)} style={{ cursor: 'pointer', width: '20px', display: 'inline-block', userSelect: 'none', fontWeight: 'bold' }}>{aberto ? 'v ' : '> '}</span>}
                    <LabelMagico valor={getLabel(labelKey, fallbackLabel)} onChange={(v) => setLabel(labelKey, v)} />
                </div>
                <div style={{ fontSize: '0.85em', color: '#fff', border: `1px solid ${temaScouter.cor}`, padding: '2px 10px', borderRadius: '4px', background: temaScouter.bgDark, fontWeight: 'bold', boxShadow: `inset 0 0 8px ${temaScouter.cor}80` }}>
                    Poder: {formatarPoderCosmico(Number(poderVerdadeiro) || 0)}
                </div>
            </div>
            {numBarras > 1 ? (
                // 💔 BREAK BARS: 2+ barras (ver core/vitals.js > calcularBarrasVida/montarBarrasVida) usam o visual
                // novo de barras em pílula com losangos e "quebra" animada ao esvaziar (pedido do
                // usuário) — componente compartilhado com Status/Mestre/Mapa (components/shared/BarrasVida.jsx).
                <BarrasVida
                    barras={barras}
                    cor={corBarra}
                    corTexto={corTextoBarra}
                    altura={35}
                    renderTexto={(atualSeguro, maxSeguro, i) => (
                        <>
                            <CampoMagico valor={atualSeguro} onChange={(v) => salvar(`${vitalKey}.atual`, aplicarEdicaoBarraVida(barras, maxSeguro, i, v))} isNumber={true} styleExtra={{ width: '120px', textAlign: 'right', color: corTextoBarra, textShadow: 'inherit', borderBottom: `1px dashed ${corTextoBarra === '#fff' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'}` }} />
                            <span style={{ margin: '0 8px' }}>/</span>
                            <span>{maxSeguro.toLocaleString('pt-BR')}</span>
                        </>
                    )}
                />
            ) : (
                <BarraVital
                    atual={barras[0].atual}
                    maximo={barras[0].max}
                    pVit={pVit}
                    cor={corBarra}
                    corTexto={corTextoBarra}
                    onChangeAtual={(v) => salvar(`${vitalKey}.atual`, aplicarEdicaoBarraVida(barras, barras[0].max, 0, v))}
                />
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '0.8em', opacity: 0.85 }}>
                <span style={{ opacity: 0.7 }}>💖 Regen/turno:</span>
                <input
                    type="number" step="0.01" value={regenManual}
                    onChange={(e) => salvar(`${vitalKey}.regeneracao`, parseFloat(e.target.value) || 0)}
                    style={{ width: '70px', background: 'rgba(0,0,0,0.3)', color: 'inherit', border: `1px solid ${corBarra}80`, borderRadius: '4px', padding: '2px 4px', textAlign: 'center' }}
                    title="Regeneração manual/fixa deste vital"
                />
                {regenBuff > 0 && (
                    <span style={{ color: '#0f0', textShadow: '0 0 5px rgba(0,255,0,0.5)' }}>
                        + {regenBuff} (Poder/Passiva/Item) = <strong>{regenTotal}</strong>/turno
                    </span>
                )}
            </div>

            {aberto && subItens && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginLeft: '35px', marginTop: '12px' }}>
                    {subItens.map(sub => {
                        const subBaseRaw = ficha?.[sub.key]?.base;
                        const trueSubBase = getPoderVerdadeiro(sub.key, ficha, true, supressao);
                        return (
                            <div key={sub.labelKey} style={{ fontSize: '1.05em', display: 'flex', alignItems: 'center' }}>
                                <LabelMagico valor={getLabel(sub.labelKey, sub.fallbackLabel)} onChange={(v) => setLabel(sub.labelKey, v)} />
                                <span style={{ fontWeight: 'bold', fontStyle: 'italic', margin: '0 5px' }}>: (</span>
                                <CampoMagico valor={subBaseRaw || ''} displayOverride={trueSubBase !== '' ? formatarPoderCosmico(Number(trueSubBase) || 0) : ''} onChange={(v) => salvar(`${sub.key}.base`, v)} styleExtra={{ width: '90px' }} isNumber={true} type="number" />
                                <span style={{ fontWeight: 'bold', fontStyle: 'italic' }}>)</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ==========================================
// 📜 O COMPONENTE: HIERARQUIA DE DOMÍNIOS
// ==========================================
function QuadranteCategoria({ catKey, catData, dominiosSalvos, updateFicha }) {
    const [selectValue, setSelectValue] = useState('');
    const [inputValue, setInputValue] = useState('');
    // 🔥 EVOLUÇÃO EM MASSA (pedido do usuário): marca vários domínios deste quadrante e sobe todos
    // de uma vez pro nível escolhido, em vez de um select por um select.
    const [marcados, setMarcados] = useState(() => new Set());
    const [nivelAlvoMassa, setNivelAlvoMassa] = useState(1);
    const corTema = catData.cor || '#ffffff';
    // 🛡️ Resistência/Redução de Dano só fazem sentido pras 4 categorias de Elementos (Básicos/
    // Avançados/Verdadeiros) — são elas que alimentam calcularReducaoDanoElemental/
    // getFracaoResistenciaElemental em combate (ver core/dominios.js), nunca Artes Marciais,
    // Cura, Invocações etc.
    const isElemental = catKey.startsWith('elementos_');
    const fichaParaDominio = { dominios: dominiosSalvos };

    const dominiosFiltrados = Object.entries(dominiosSalvos).filter(([nome, dados]) => {
        if (!dados || typeof dados !== 'object' || !dados.nivel) return false;
        const nomeLower = String(nome).trim().toLowerCase();
        if (['elementos', 'mana', 'chakra', 'aura', 'astral', 'primordiais'].includes(nomeLower)) return false;
        return dados.categoria === catKey || encontrarCategoriaPorLore(nome) === catKey; 
    });

    const handleAdd = (val) => {
        const nome = val?.trim(); if (!nome) return;
        updateFicha(f => {
            if (!f.dominios) f.dominios = {};
            if (!f.dominios[nome] || typeof f.dominios[nome] !== 'object') f.dominios[nome] = { nivel: 1, categoria: catKey };
            else f.dominios[nome].categoria = catKey;
        });
        callSave(); setSelectValue(''); setInputValue('');
    };

    const handleAddTudo = () => {
        if (!window.confirm(`Deseja preencher esta aba adicionando todos os itens oficiais de ${catData.titulo}?`)) return;
        updateFicha(f => {
            if (!f.dominios) f.dominios = {};
            (PREDEFINIDOS_LORE[catKey] || []).forEach(grupo => {
                grupo.itens.forEach(nome => {
                    if (!f.dominios[nome] || typeof f.dominios[nome] !== 'object') {
                        f.dominios[nome] = { nivel: 1, categoria: catKey };
                    } else {
                        f.dominios[nome].categoria = catKey;
                    }
                });
            });
        });
        callSave();
    };

    const handleRemove = (nome) => {
        if (!window.confirm(`Riscar o domínio [${nome}] das suas páginas?`)) return;
        updateFicha(f => { if (f.dominios) delete f.dominios[nome]; }); callSave();
        setMarcados(prev => { if (!prev.has(nome)) return prev; const s = new Set(prev); s.delete(nome); return s; });
    };

    const handleChangeNivel = (nome, nivel) => {
        updateFicha(f => { if (f.dominios && f.dominios[nome]) f.dominios[nome].nivel = parseInt(nivel); });
        callSave();
    };

    const handleMove = (nome, newCat) => {
        if (!newCat) return;
        updateFicha(f => { if (f.dominios && f.dominios[nome]) f.dominios[nome].categoria = newCat; });
        callSave();
    };

    const toggleMarcado = (nome) => {
        setMarcados(prev => {
            const atual = new Set(prev);
            if (atual.has(nome)) atual.delete(nome); else atual.add(nome);
            return atual;
        });
    };

    const selecionarTodosMassa = (marcar) => {
        setMarcados(marcar ? new Set(dominiosFiltrados.map(([nome]) => nome)) : new Set());
    };

    const aplicarNivelEmMassa = () => {
        const nomesAlvo = dominiosFiltrados.map(([nome]) => nome).filter(nome => marcados.has(nome));
        if (nomesAlvo.length === 0) return;
        updateFicha(f => {
            if (!f.dominios) return;
            nomesAlvo.forEach(nome => { if (f.dominios[nome]) f.dominios[nome].nivel = nivelAlvoMassa; });
        });
        callSave();
        setMarcados(new Set());
    };

    return (
        <div style={{ border: `1px solid ${corTema}`, padding: '20px', borderRadius: '8px', background: 'rgba(0,0,0,0.1)', position: 'relative', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: `inset 0 0 15px ${corTema}10` }}>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '1.25em', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', color: corTema }}>
                <span>{catData.icone}</span> {catData.titulo}
            </h3>
            <div style={{ width: '100%', borderBottom: '1px dotted currentColor', opacity: 0.2, marginBottom: '5px' }} />

            <div style={{ display: 'flex', gap: '10px' }}>
                <select value={selectValue} onChange={e => setSelectValue(e.target.value)} style={{ flex: 1, background: '#0a0a0f', border: `1px solid ${corTema}`, color: '#fff', padding: '10px', borderRadius: '4px', outline: 'none', fontFamily: 'inherit', fontSize: '0.95em' }}>
                    <option value="">-- Escolher da Lore --</option>
                    {(PREDEFINIDOS_LORE[catKey] || []).map(g => (
                        <optgroup key={g.label} label={`— ${g.label} —`} style={{ color: '#fff', background: '#0a0a0f' }}>{g.itens.map(item => <option key={item} value={item}>{item}</option>)}</optgroup>
                    ))}
                </select>
                <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => handleAdd(selectValue)} style={{ background: 'transparent', border: `1px solid ${corTema}`, color: corTema, cursor: 'pointer', padding: '10px 15px', borderRadius: '4px', fontWeight: 'bold' }}>+ ADD</button>
                    {(PREDEFINIDOS_LORE[catKey] && PREDEFINIDOS_LORE[catKey].length > 0) && (
                        <button onClick={handleAddTudo} style={{ background: `${corTema}22`, border: `1px solid ${corTema}`, color: corTema, cursor: 'pointer', padding: '10px', borderRadius: '4px', fontWeight: 'bold', textTransform: 'uppercase', fontFamily: 'inherit', boxShadow: `0 0 10px ${corTema}44` }} title="Adicionar toda a Lore de uma vez">+ TUDO</button>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
                <input type="text" placeholder="Criar novo..." value={inputValue} onChange={e => setInputValue(e.target.value)} style={{ flex: 1, background: '#0a0a0f', border: '1px solid #ffcc00', color: '#fff', padding: '10px', borderRadius: '4px', outline: 'none' }} />
                <button onClick={() => handleAdd(inputValue)} style={{ background: 'transparent', border: '1px solid #ffcc00', color: '#ffcc00', cursor: 'pointer', padding: '10px 20px', borderRadius: '4px', fontWeight: 'bold' }}>+ CRIAR</button>
            </div>

            {dominiosFiltrados.length === 0 ? (
                <div style={{ opacity: 0.3, fontStyle: 'italic', textAlign: 'center', padding: '15px 0' }}>Vazio...</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '5px' }}>
                    {dominiosFiltrados.length > 1 && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '10px', border: `1px dashed ${corTema}`, borderRadius: '6px', background: `${corTema}0d` }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8em', color: '#ccc', cursor: 'pointer', flex: '1 0 auto' }}>
                                <input type="checkbox" checked={dominiosFiltrados.every(([nome]) => marcados.has(nome))} onChange={e => selecionarTodosMassa(e.target.checked)} />
                                Selecionar Todos
                            </label>
                            <select value={nivelAlvoMassa} onChange={e => setNivelAlvoMassa(parseInt(e.target.value))} style={{ background: '#0a0a0f', color: NIVEIS_DOMINIO[nivelAlvoMassa].cor, border: `1px solid ${NIVEIS_DOMINIO[nivelAlvoMassa].cor}`, borderRadius: '4px', padding: '4px 8px', outline: 'none', fontWeight: 'bold' }}>
                                {Object.entries(NIVEIS_DOMINIO).map(([n, d]) => (<option key={n} value={n}>Lv {n} - {d.nome}</option>))}
                            </select>
                            <button onClick={aplicarNivelEmMassa} disabled={marcados.size === 0} style={{ background: marcados.size === 0 ? 'transparent' : `${corTema}22`, border: `1px solid ${corTema}`, color: corTema, cursor: marcados.size === 0 ? 'default' : 'pointer', padding: '6px 12px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.8em', opacity: marcados.size === 0 ? 0.5 : 1 }}>
                                ⚡ APLICAR A {marcados.size} SELECIONADO{marcados.size === 1 ? '' : 'S'}
                            </button>
                        </div>
                    )}
                    {dominiosFiltrados.map(([nomeDom, dadosDom]) => {
                        const nivel = dadosDom?.nivel || 1;
                        const infoNivel = NIVEIS_DOMINIO[nivel] || NIVEIS_DOMINIO[1];
                        return (
                            <div key={nomeDom} style={{ padding: '14px', border: `1px solid ${corTema}`, background: '#050508', borderRadius: '6px', position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px', boxShadow: marcados.has(nomeDom) ? `0 0 8px ${corTema}80` : 'none' }}>
                                <button onClick={() => handleRemove(nomeDom)} style={{ position: 'absolute', top: '10px', right: '12px', background: 'transparent', border: 'none', color: '#ff003c', fontSize: '1.3em', cursor: 'pointer' }}>✖</button>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '25px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minWidth: 0 }}>
                                        <input type="checkbox" checked={marcados.has(nomeDom)} onChange={() => toggleMarcado(nomeDom)} />
                                        <strong style={{ fontSize: '1.2em', textTransform: 'uppercase', color: '#fff' }}>{nomeDom}</strong>
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {!encontrarCategoriaPorLore(nomeDom) && (
                                            <select value={dadosDom.categoria || catKey} onChange={e => handleMove(nomeDom, e.target.value)} style={{ background: '#0a0a0f', color: '#aaa', border: '1px dashed #444', borderRadius: '4px', padding: '4px 6px', fontSize: '0.85em', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }} title="Mover para outro quadrante">
                                                {Object.entries(CATEGORIAS_DOMINIO).map(([k, c]) => (
                                                    <option key={k} value={k}>➔ {c.titulo.split(' ')[0]}</option>
                                                ))}
                                            </select>
                                        )}
                                        <select value={nivel} onChange={e => handleChangeNivel(nomeDom, e.target.value)} style={{ background: '#0a0a0f', color: infoNivel.cor, border: `1px solid ${infoNivel.cor}`, borderRadius: '4px', padding: '4px 8px', outline: 'none', fontWeight: 'bold' }}>
                                            {Object.entries(NIVEIS_DOMINIO).map(([n, d]) => (<option key={n} value={n}>Lv {n}</option>))}
                                        </select>
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.9em', fontStyle: 'italic', color: '#ccc' }}><span style={{ color: infoNivel.cor, fontWeight: 'bold' }}>⚡ :</span> {infoNivel.desc}</div>
                                {isElemental && nivel > 0 && (
                                    <div style={{ fontSize: '0.82em', color: '#aaa', borderTop: '1px dotted #333', paddingTop: '6px' }}>
                                        🛡️ Resistência: <strong style={{ color: infoNivel.cor }}>{Math.round(getFracaoDominio(fichaParaDominio, nomeDom) * 100)}%</strong>
                                        {' '}| Redução de Dano (máx., vs. Domínio 0): <strong style={{ color: infoNivel.cor }}>{Math.round(calcularReducaoDanoElemental(nivel, 0) * 100)}%</strong>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

const DominiosPanel = ({ ficha, updateFicha }) => (
    <div style={{ width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <h1 style={{ fontSize: '3em', fontStyle: 'italic', fontWeight: 'bold', margin: '0', paddingBottom: '10px', borderBottom: `2px dashed currentColor` }}>A Hierarquia de Domínios</h1>
            <p style={{ opacity: 0.7, fontStyle: 'italic', marginTop: '5px' }}>O Conhecimento Absoluto das Artes Místicas e Marciais</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '25px' }}>
            {Object.entries(CATEGORIAS_DOMINIO).map(([catKey, catData]) => (<QuadranteCategoria key={catKey} catKey={catKey} catData={catData} dominiosSalvos={ficha?.dominios || {}} updateFicha={updateFicha} />))}
        </div>
    </div>
);

// ==========================================
// 📖 PAINEL PRINCIPAL (A FICHA DEFINITIVA)
// ==========================================
export default function MarcadosPanel() {
    const minhaFicha = useStore(s => s?.minhaFicha);
    const updateFicha = useStore(s => s?.updateFicha);
    const meuNome = useStore(s => s?.meuNome);
    const isMestreStatus = useStore(s => s?.isMestre) || false;
    const importarDaAbaStatus = useStore(s => s?.importarDaAbaStatus);
    const divisorPoderMesa = useStore(s => s?.divisorPoderMesa) || 1;
    const setDivisorPoderMesa = useStore(s => s?.setDivisorPoderMesa);

    const [uploadingImg, setUploadingImg] = useState(false);
    const [modalEstilo, setModalEstilo] = useState(false);
    const [paginaAtual, setPaginaAtual] = useState(1);
    // 🔥 Correção: "Guardar Ficha" mostrava "✅ Guardado!" na hora do clique, ANTES da gravação no
    // Firebase sequer começar (o antigo callSave não aguardava salvarFirebaseImediato) — se o
    // jogador saísse da página logo depois, a gravação podia nunca terminar e ele não teria como
    // saber. Agora o estado só vira "salvo" depois que a gravação de fato confirma, e "erro" se
    // ela falhar, em vez de fingir sucesso sempre.
    const [estadoSalvar, setEstadoSalvar] = useState('idle'); // 'idle' | 'salvando' | 'salvo' | 'erro'
    const tentativaSalvarRef = useRef(0); // evita que o timeout de uma tentativa antiga reverta pra "idle" por cima de uma tentativa mais nova em andamento
    const [attrBaseFocado, setAttrBaseFocado] = useState(null);
    const [animDirection, setAnimDirection] = useState('next');
    
    const [localCorFundo, setLocalCorFundo] = useState('#bba9d8');
    const [localCorTexto, setLocalCorTexto] = useState('#000000');
    const [localCorTinta, setLocalCorTinta] = useState('#000000');
    const [localBgImg, setLocalBgImg] = useState('');
    const [localMolduraAvatar, setLocalMolduraAvatar] = useState('');
    const [localCorMoldura, setLocalCorMoldura] = useState('#ffffff');
    const [localIconeClasse, setLocalIconeClasse] = useState('');
    const [localModoMoldura, setLocalModoMoldura] = useState('screen'); 
    const [localModoFundo, setLocalModoFundo] = useState('normal'); 
    const [localCorFundoTint, setLocalCorFundoTint] = useState('#ffffff'); 
    const [localIconeOffsetY, setLocalIconeOffsetY] = useState(-45);
    
    // 🔥 NOVOS REGULADORES DE PINTURA 🔥
    const [localMolduraOpColor, setLocalMolduraOpColor] = useState(1);
    const [localMolduraOpMultiply, setLocalMolduraOpMultiply] = useState(0.85);
    const [localMolduraOpOverlay, setLocalMolduraOpOverlay] = useState(0.6);

    const [textoImport, setTextoImport] = useState('');
    const [modalImport, setModalImport] = useState(false);

    // 🔥 NOVA PALETA OFICIAL RPG/ANIME 🔥
    const PALETA_PREMIUM = [
        { cor: '#ffffff', nome: 'Luz (Branco)' },
        { cor: '#000000', nome: 'Morte (Preto)' },
        { cor: '#ff003c', nome: 'Sangue (Vermelho)' },
        { cor: '#aa00ff', nome: 'Energia (Roxo)' },
        { cor: '#ffcc00', nome: 'Conhecimento (Dourado)' },
        { cor: '#00e5ff', nome: 'Medo (Ciano)' },
        { cor: '#00ff66', nome: 'Natureza (Verde)' },
        { cor: '#0088ff', nome: 'Oceano (Azul)' }
    ];

    useEffect(() => {
        if (minhaFicha) {
            setLocalCorFundo(minhaFicha.estetica?.diarioCor || '#bba9d8');
            setLocalCorTexto(minhaFicha.estetica?.corTexto || '#000000');
            setLocalCorTinta(minhaFicha.estetica?.corTintaRadar || '#000000');
            setLocalBgImg(minhaFicha.estetica?.bgImg || '');
            setLocalMolduraAvatar(minhaFicha.estetica?.molduraAvatar || '');
            setLocalCorMoldura(minhaFicha.estetica?.corMoldura || '#ffffff');
            setLocalIconeClasse(minhaFicha.estetica?.iconeClasse || '');
            setLocalModoMoldura(minhaFicha.estetica?.modoMoldura || 'screen'); 
            setLocalModoFundo(minhaFicha.estetica?.modoFundo || 'normal');
            setLocalCorFundoTint(minhaFicha.estetica?.corFundoTint || '#ffffff');
            setLocalIconeOffsetY(minhaFicha.estetica?.iconeOffsetY ?? -45);
            setLocalMolduraOpColor(minhaFicha.estetica?.molduraOpColor ?? 1);
            setLocalMolduraOpMultiply(minhaFicha.estetica?.molduraOpMultiply ?? 0.85);
            setLocalMolduraOpOverlay(minhaFicha.estetica?.molduraOpOverlay ?? 0.6);
        }
    }, [minhaFicha?.estetica]);

    const { ascensaoGeralEfetiva, ascensaoGeralEfetivaParaPoder, fatorCrescimentoBase, fatorCrescimentoAtual, fatorAtributosBase, fatorAtributosAtual, fatoresVitaisAtual } = useMemo(() => {
        const fatoresVitaisPadrao = { vida: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 };
        if (!minhaFicha) return { ascensaoGeralEfetiva: 1, ascensaoGeralEfetivaParaPoder: 1, fatorCrescimentoBase: 1, fatorCrescimentoAtual: 1, fatorAtributosBase: 1, fatorAtributosAtual: 1, fatoresVitaisAtual: fatoresVitaisPadrao };
        const ascensaoBase = parseInt(minhaFicha.ascensaoBase) || 1;
        const multP = minhaFicha.multiplicadorForcaPrestigio ?? 1;
        const multA = parseFloat(minhaFicha.multiplicadorForcaAscensao) || 1;
        const ascensaoBaseEfetiva = ascensaoBase * multA;

        const calcularFator = (comFormas, ignorarPoderes = false, continuo = false) => {
            const bonusPorCategoria = ['vida', 'mana', 'aura', 'chakra', 'corpo', 'status'].map(k => {
                const displayP = getPontosParaAscensao(minhaFicha, k);
                let pAtual = displayP;
                if (comFormas) {
                    let mF = getEfetivoMFormas(minhaFicha, k, ignorarPoderes);
                    let multForma = mF >= 10 ? (mF / 10) : (mF > 1 ? mF : 1);
                    pAtual = Math.floor(displayP * multForma);
                }
                const rankInfo = aplicarMultiplicadorForca(pAtual, ascensaoBase, multP, multA);
                return Math.max(0, (rankInfo.ascensaoFinal || 0) - ascensaoBaseEfetiva);
            });
            // 🔥 CORREÇÃO (1): antes usava Math.min(...) — travava o ganho geral na categoria mais
            // fraca das 6, então multiplicadorForcaPrestigio só tinha efeito se TODAS as 6
            // categorias subissem de nível juntas. Trocado pela MÉDIA, igual core/poder.js — mesma
            // fonte de verdade, ver comentário lá para o motivo.
            //
            // 🔥 CORREÇÃO (2): pra quem alimenta o Poder Calculado (continuo=true, ver
            // ascensaoGeralEfetivaParaPoder abaixo), a média NÃO é mais arredondada pra baixo — um
            // segundo Math.floor em cima da média (que já soma bônus individualmente arredondados)
            // fazia falta acumular Prestígio×multiplicadorForcaPrestigio suficiente pra mover a
            // média em 1 nível INTEIRO antes do Poder Calculado sequer reagir, mesmo com o
            // multiplicador claramente maior. O indicador "Ascensão Geral Efetiva" exibido pro
            // jogador (continuo=false, o padrão) continua arredondado — ali faz sentido ser um
            // número inteiro de Rank/Ascensão.
            const nivelMedio = bonusPorCategoria.reduce((a, b) => a + b, 0) / bonusPorCategoria.length;
            const nivelCompletos = continuo ? nivelMedio : Math.floor(nivelMedio);
            const geral = (ascensaoBase + nivelCompletos) * multA;
            const fator = geral / (ascensaoBase || 1);
            return { geral: isNaN(geral) ? ascensaoBase : geral, fator: isNaN(fator) ? 1 : fator };
        };

        const calcularFatorCategoria = (key, comFormas) => {
            const displayP = getPontosParaAscensao(minhaFicha, key);
            let pAtual = displayP;
            if (comFormas) {
                let mF = getEfetivoMFormas(minhaFicha, key);
                let multForma = mF >= 10 ? (mF / 10) : (mF > 1 ? mF : 1);
                pAtual = Math.floor(displayP * multForma);
            }
            const rankInfo = aplicarMultiplicadorForca(pAtual, ascensaoBase, multP, multA);
            const geral = rankInfo.ascensaoFinal || ascensaoBaseEfetiva;
            const fator = geral / (ascensaoBase || 1);
            return isNaN(fator) ? 1 : fator;
        };

        const fatoresVitais = {};
        ['vida', 'mana', 'aura', 'chakra', 'corpo'].forEach(k => { fatoresVitais[k] = calcularFatorCategoria(k, true); });

        return {
            ascensaoGeralEfetiva: calcularFator(true).geral,
            ascensaoGeralEfetivaParaPoder: calcularFator(true, true, true).geral,
            fatorCrescimentoBase: calcularFator(false).fator,
            fatorCrescimentoAtual: calcularFator(true).fator,
            fatorAtributosBase: calcularFatorCategoria('status', false),
            fatorAtributosAtual: calcularFatorCategoria('status', true),
            fatoresVitaisAtual: fatoresVitais,
        };
    }, [minhaFicha]);

    const { poderGlobal, vitalidadeGlobal, supressao, limiteSupressao, temaScouter } = useMemo(() => {
        if (!minhaFicha) return { poderGlobal: 0, vitalidadeGlobal: 0, supressao: 100, limiteSupressao: 1, temaScouter: getTemaScouter(100, 1) };
        
        let sup = parseFloat(minhaFicha.supressaoPoder);
        if (isNaN(sup)) sup = 100;
        let lim = parseFloat(minhaFicha.limiteSupressao);
        if (isNaN(lim)) lim = 1;
        if (sup < lim) sup = lim; 
        
        const tema = getTemaScouter(sup, lim);

        const calcPoderBase = () => {
            const efetivo = (k) => { const v = safeGetEfetivoBase(minhaFicha, k, true); return isNaN(v) ? 0 : v; };
            let somaStatus = 0;
            ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'].forEach(s => { somaStatus += efetivo(s); });
            const statusEfetivo = somaStatus / 8;
            return ((efetivo('vida') * 10) + efetivo('chakra') + efetivo('mana') + efetivo('corpo') + efetivo('aura') + (statusEfetivo * 100)) / 6;
        };

        const poderBase = calcPoderBase();
        const glob = getGlobalMultipliers(minhaFicha);

        const ascensaoSegura = Number(ascensaoGeralEfetivaParaPoder) || 0;
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

        // 🔥 TODO mUnico se junta aqui, no mesmo estágio (pós-injeção de Ascensão):
        // glob.finalUni (Balança de Adaptação / buffs / texto de habilidades),
        // multiplicadorPoderDireto (mUnicos de Poderes/poder_direto) e
        // multiplicadorMunicoCrescente (mUnico Crescente por turno) — nenhuma
        // fonte de mUnico fica isolada do resto, então mUnico sempre multiplica
        // mUnico, não importa de onde venha.
        const multiplicadorPoderDireto = clampFinito(getPoderDiretoMultiplier(minhaFicha));
        const multiplicadorMunicoCrescente = clampFinito(getMunicoCrescenteMultiplier(minhaFicha));
        const multiplicadorMunicoTotal = clampFinito(glob.finalUni) * multiplicadorPoderDireto * multiplicadorMunicoCrescente;
        poderComAscensao = clampFinito(poderComAscensao * multiplicadorMunicoTotal);

        let power = poderComAscensao * (sup / 100);
        power = clampFinito(power);

        // 😮‍💨 Fadiga de Combate (ver "Marcadores & Adaptação" > Fadiga): desgaste acumulado
        // durante a cena/luta reduz o Poder Calculado do Scouter proporcionalmente.
        // calcularFadigaAtual (core/fadiga.js) é a única fonte de verdade pra este número,
        // compartilhada com core/poder.js, pra a Ficha e o Mapa nunca mostrarem valores diferentes.
        const fadigaAtualParaPoder = calcularFadigaAtual(minhaFicha);
        power = power * (1 - fadigaAtualParaPoder / 100);
        power = clampFinito(power);

        const divisorIndividual = parseFloat(minhaFicha.divisorPoder);
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
    }, [minhaFicha, divisorPoderMesa, ascensaoGeralEfetivaParaPoder]);

    if (!minhaFicha) return <div style={{ color: '#000', padding: 20, fontFamily: 'cursive' }}>Abrindo a Ficha...</div>;

    const isMestre = isMestreStatus || (minhaFicha?.isMestre === true);
    const classeInfo = getClasseInfo(minhaFicha);
    const iconeFinal = localIconeClasse || classeInfo?.iconeUrl;
    // 🔥 Cor do "glow" do avatar/ícone de classe — usa a cor da classe do personagem quando
    // definida (ficha sem classe, ou classe sem "cor" cadastrada) cai no ciano neon padrão do tema.
    const glowColor = classeInfo?.cor || '#00ffcc';
    
    const mudarPagina = (nova) => { setAnimDirection(nova > paginaAtual ? 'next' : 'prev'); setPaginaAtual(nova); };

    const salvar = (caminho, valor) => {
        const valFinal = (valor === undefined || (isNaN(valor) && typeof valor === 'number')) ? null : valor;
        updateFicha(f => {
            const chaves = caminho.split('.');
            let atual = f;
            for (let i = 0; i < chaves.length - 1; i++) {
                if (typeof atual[chaves[i]] !== 'object' || atual[chaves[i]] === null) atual[chaves[i]] = {};
                atual = atual[chaves[i]];
            }
            atual[chaves[chaves.length - 1]] = valFinal;
        });
        callSave();
    };

    const salvarDivisorPoderMesaHandler = (valor) => {
        let v = parseFloat(valor);
        if (isNaN(v) || v <= 0) v = 1;
        setDivisorPoderMesa(v); // atualização otimista local — some não espera o Firebase pra refletir na UI

        // 🔥 Se a gravação no Firebase falhar, este navegador fica "sozinho" com o valor novo (só
        // localStorage) enquanto o resto da mesa continua vendo o valor antigo — cada um calculando
        // um Poder Atual diferente pro MESMO personagem sem nenhum aviso. Por isso o alerta aqui.
        // Debounced (input sem debounce próprio, disparava uma escrita por tecla) pra não empilhar
        // um alert() por dígito digitado se a rede estiver instável.
        if (divisorPoderMesaTimer) clearTimeout(divisorPoderMesaTimer);
        divisorPoderMesaTimer = setTimeout(() => {
            salvarDivisorPoderMesa(v).then((ok) => {
                if (!ok) alert('⚠️ Não foi possível sincronizar o Divisor de Poder Padrão com o servidor — os outros jogadores podem continuar vendo o valor antigo. Verifique sua conexão e tente de novo.');
            });
        }, 500);
    };

    const handleStyleChange = (key, val) => {
        if (key === 'diarioCor') setLocalCorFundo(val);
        else if (key === 'corTexto') setLocalCorTexto(val);
        else if (key === 'corTintaRadar') setLocalCorTinta(val);
        else if (key === 'bgImg') setLocalBgImg(val);
        else if (key === 'molduraAvatar') setLocalMolduraAvatar(val);
        else if (key === 'corMoldura') setLocalCorMoldura(val);
        else if (key === 'iconeClasse') setLocalIconeClasse(val);
        else if (key === 'modoMoldura') setLocalModoMoldura(val);
        else if (key === 'modoFundo') setLocalModoFundo(val);
        else if (key === 'corFundoTint') setLocalCorFundoTint(val);
        else if (key === 'iconeOffsetY') setLocalIconeOffsetY(val);
        else if (key === 'molduraOpColor') setLocalMolduraOpColor(val);
        else if (key === 'molduraOpMultiply') setLocalMolduraOpMultiply(val);
        else if (key === 'molduraOpOverlay') setLocalMolduraOpOverlay(val);

        if (window.timerSaveCor) clearTimeout(window.timerSaveCor);
        window.timerSaveCor = setTimeout(() => {
            updateFicha(f => { if (!f.estetica) f.estetica = {}; f.estetica[key] = val; });
            callSave();
        }, 800);
    };

    // 🔥 Upload como arquivo (base64 direto no Realtime Database) — o Firebase Storage
    // (uploadImagem de firebase-sync.js) não estava funcionando (avatares somem/não sobem pra
    // outros jogadores); lerImagemComoBase64 evita o Storage por completo, mesmo padrão já usado
    // em RelicarioPanel.jsx/FormasEditor.jsx/CompendioFormContext.jsx.
    const handleBgUpload = (e) => { const file = e.target.files[0]; if (!file) return; lerImagemComoBase64(file).then(url => handleStyleChange('bgImg', url)).catch(err => alert(err.message || 'Erro ao enviar a imagem!')); };
    const handleMolduraUpload = (e) => { const file = e.target.files[0]; if (!file) return; lerImagemComoBase64(file).then(url => handleStyleChange('molduraAvatar', url)).catch(err => alert(err.message || 'Erro ao enviar a moldura!')); };
    const handleIconeUpload = (e) => { const file = e.target.files[0]; if (!file) return; lerImagemComoBase64(file).then(url => handleStyleChange('iconeClasse', url)).catch(err => alert(err.message || 'Erro ao enviar o ícone!')); };

    const handleImageUpload = (e) => {
        const file = e.target.files[0]; if (!file) return;
        setUploadingImg(true);
        lerImagemComoBase64(file)
            .then((url) => {
                updateFicha(f => { if (!f.avatar) f.avatar = { base: "" }; f.avatar.base = url; });
                callSave();
            })
            .catch((err) => alert(err.message || 'Erro ao pintar o avatar!'))
            .finally(() => setUploadingImg(false));
    };

    const executarImportacao = () => {
        if (!textoImport.trim()) return alert("Cole o texto do Google Docs primeiro!");
        importarDaAbaStatus(textoImport);
        setModalImport(false);
        setTextoImport('');
        alert("A sua ficha foi sincronizada!");
    };

    const calcularAscensaoAtualStatus = () => {
        const displayPStatus = getPontosParaAscensao(minhaFicha, 'status');
        let mF = 1;
        if (fatorCrescimentoAtual > 1) { mF = getEfetivoMFormas(minhaFicha, 'status'); if (isNaN(mF) || mF < 1) mF = 1; }
        const pAtualValor = Math.floor(displayPStatus * mF);
        const rankInfo = aplicarMultiplicadorForca(pAtualValor, minhaFicha.ascensaoBase || 1, minhaFicha.multiplicadorForcaPrestigio ?? 1, minhaFicha.multiplicadorForcaAscensao ?? 1);
        return Math.max(1, Math.floor(rankInfo.ascensaoFinal || 1));
    };

    const handleTabelaChange = (k, tipo, valor) => {
        let numVal = Number(valor); if (isNaN(numVal)) numVal = 0;
        const divAtual = parseFloat(minhaFicha.divisores?.[k]) || 1;
        const prestAtual = safeGetMaximo(minhaFicha, k);
        let novoP = tipo === 'prestigio' ? numVal : prestAtual;
        let novoDiv = tipo === 'divisor' ? (numVal > 0 ? numVal : 1) : divAtual;
        const mults = { vida: 1000000, mana: 10000000, aura: 10000000, chakra: 10000000, corpo: 10000000, status: 1000 };
        const novaBase = Math.floor((novoP / novoDiv) * (mults[k] || 1));

        let avisoReducaoIncompleta = null;
        if (tipo === 'prestigio' && k === 'status') {
            const ascensaoAtual = calcularAscensaoAtualStatus();
            const aplicadoAntes = parseFloat(minhaFicha.statusPrestigioAplicado) || 0;
            const deltaPrestigio = novoP - aplicadoAntes;
            const poolCreditoAlvo = deltaPrestigio * 8 * ascensaoAtual;
            const poolAntes = parseFloat(minhaFicha.statusPool) || 0;
            if (poolCreditoAlvo < 0 && (poolAntes + poolCreditoAlvo) < 0) {
                const poolReduzido = poolAntes;
                const poolPedido = Math.abs(poolCreditoAlvo);
                avisoReducaoIncompleta = `Só foi possível remover ${poolReduzido} dos ${poolPedido} pontos de pool pedidos: o restante já foi distribuído entre os atributos e precisa ser reduzido manualmente em cada um (botão "− Pool").`;
            }
        }

        updateFicha(f => {
            if (f.overridePrestigio) f.overridePrestigio = null;
            if (tipo === 'divisor') { if (!f.divisores) f.divisores = {}; f.divisores[k] = novoDiv; }
            if (tipo === 'prestigio') {
                if (k === 'status') {
                    const ascensaoAtual = calcularAscensaoAtualStatus();
                    const aplicadoAntes = parseFloat(f.statusPrestigioAplicado) || 0;
                    const deltaPrestigio = novoP - aplicadoAntes;
                    const poolCreditoAlvo = deltaPrestigio * 8 * ascensaoAtual;
                    const poolAntes = parseFloat(f.statusPool) || 0;
                    const poolDepois = Math.max(0, poolAntes + poolCreditoAlvo);
                    const creditoRealAplicado = poolDepois - poolAntes;
                    f.statusPool = poolDepois;
                    f.statusPrestigioAplicado = aplicadoAntes + (creditoRealAplicado / (8 * ascensaoAtual));
                }
                else { if (!f[k]) f[k] = {}; f[k].base = novaBase; }
            }
        });
        callSave();
        if (avisoReducaoIncompleta) alert(avisoReducaoIncompleta);
    };

    const alocarPontoStatus = (attrKey, qtd) => {
        const pontos = Math.floor(Number(qtd)) || 0;
        if (pontos <= 0) return;
        const divStatus = parseFloat(minhaFicha.divisores?.status) || 1;
        updateFicha(f => {
            const poolAtual = Math.max(0, parseFloat(f.statusPool) || 0);
            const usar = Math.min(pontos, poolAtual);
            if (usar <= 0) return;
            const acrescimo = Math.floor((usar / divStatus) * 1000);
            if (acrescimo <= 0) return;
            if (!f[attrKey]) f[attrKey] = {};
            f[attrKey].base = (parseFloat(f[attrKey].base) || 0) + acrescimo;
            f.statusPool = poolAtual - usar;
            f.statusPoolGasto = (parseFloat(f.statusPoolGasto) || 0) + usar;
            if (!f.statusPoolAlocado) f.statusPoolAlocado = {};
            f.statusPoolAlocado[attrKey] = (parseFloat(f.statusPoolAlocado[attrKey]) || 0) + acrescimo;
        });
        callSave();
    };

    const devolverPontoStatus = (attrKey, qtd) => {
        const pontosPedidos = Math.floor(Number(qtd)) || 0;
        if (pontosPedidos <= 0) return;
        const divStatus = parseFloat(minhaFicha.divisores?.status) || 1;
        const alocadoAttrAntes = Math.max(0, parseFloat(minhaFicha.statusPoolAlocado?.[attrKey]) || 0);
        const reducaoBasePedida = Math.floor((pontosPedidos / divStatus) * 1000);
        const avisoDevolucaoIncompleta = reducaoBasePedida > alocadoAttrAntes
            ? `Só foi possível devolver o equivalente a ${alocadoAttrAntes.toLocaleString('pt-BR')} de base: este atributo não tem mais do que isso alocado por este pool (o resto da Base dele veio de outra fonte).`
            : null;

        updateFicha(f => {
            if (!f.statusPoolAlocado) f.statusPoolAlocado = {};
            const alocadoAttr = Math.max(0, parseFloat(f.statusPoolAlocado[attrKey]) || 0);
            const baseAtual = parseFloat(f[attrKey]?.base) || 0;
            const reducaoBase = Math.min(reducaoBasePedida, alocadoAttr, baseAtual);
            if (reducaoBase <= 0) return;
            const usar = Math.floor((reducaoBase / 1000) * divStatus);
            if (usar <= 0) return;
            if (!f[attrKey]) f[attrKey] = {};
            f[attrKey].base = baseAtual - reducaoBase;
            f.statusPoolAlocado[attrKey] = alocadoAttr - reducaoBase;
            f.statusPoolGasto = Math.max(0, (parseFloat(f.statusPoolGasto) || 0) - usar);
            f.statusPool = (parseFloat(f.statusPool) || 0) + usar;
        });
        callSave();
        if (avisoDevolucaoIncompleta) alert(avisoDevolucaoIncompleta);
    };

    const pontosAlocadosStatus = (attrKey) => {
        const divStatus = parseFloat(minhaFicha.divisores?.status) || 1;
        return Math.floor(((minhaFicha.statusPoolAlocado?.[attrKey] || 0) / 1000) * divStatus);
    };

    const distribuirPoolIgualmente = () => {
        const stats8 = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
        const divStatus = parseFloat(minhaFicha.divisores?.status) || 1;
        updateFicha(f => {
            const poolAtual = Math.max(0, parseFloat(f.statusPool) || 0);
            const porAtributo = Math.floor(poolAtual / stats8.length);
            if (porAtributo <= 0) return;
            const acrescimo = Math.floor((porAtributo / divStatus) * 1000);
            if (acrescimo <= 0) return;
            if (!f.statusPoolAlocado) f.statusPoolAlocado = {};
            stats8.forEach(attrKey => {
                if (!f[attrKey]) f[attrKey] = {};
                f[attrKey].base = (parseFloat(f[attrKey].base) || 0) + acrescimo;
                f.statusPoolAlocado[attrKey] = (parseFloat(f.statusPoolAlocado[attrKey]) || 0) + acrescimo;
            });
            const usarTotal = porAtributo * stats8.length;
            f.statusPool = poolAtual - usarTotal;
            f.statusPoolGasto = (parseFloat(f.statusPoolGasto) || 0) + usarTotal;
        });
        callSave();
    };

    const handleSalvarTudo = async () => {
        const minhaTentativa = ++tentativaSalvarRef.current;
        setEstadoSalvar('salvando');
        try {
            await salvarFirebaseImediato();
            setEstadoSalvar('salvo');
            setTimeout(() => { if (tentativaSalvarRef.current === minhaTentativa) setEstadoSalvar('idle'); }, 1500);
        } catch (err) {
            setEstadoSalvar('erro');
            setTimeout(() => { if (tentativaSalvarRef.current === minhaTentativa) setEstadoSalvar('idle'); }, 3000);
        }
    };

    const getLabel = (key, fallback) => minhaFicha.labels?.[key] !== undefined ? minhaFicha.labels[key] : fallback;
    const setLabel = (key, val) => salvar(`labels.${key}`, val);
    const fonteDiario = minhaFicha.estetica?.diarioFonte || '"Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive';

    const getSupremas = () => {
        const pVida = getBasePFor(minhaFicha, 'vida'); const pChakra = getBasePFor(minhaFicha, 'chakra'); const pCorpo = getBasePFor(minhaFicha, 'corpo');
        const pMana = getBasePFor(minhaFicha, 'mana'); const pAura = getBasePFor(minhaFicha, 'aura'); const pStatus = getBasePFor(minhaFicha, 'status');
        const mPV = parseFloat(minhaFicha.multiplicadorVida) || 1; const mPM = parseFloat(minhaFicha.multiplicadorMorte) || 1;
        const ascensao = parseInt(minhaFicha.ascensaoBase) || 1; const bonusAscensao = (ascensao - 1) * 100;
        
        const fatorForca = ((fatoresVitaisAtual?.mana || 1) + (fatoresVitaisAtual?.aura || 1) + (fatoresVitaisAtual?.chakra || 1) + (fatoresVitaisAtual?.corpo || 1)) / 4;
        
        return {
            pvMax: Math.floor((((pVida + pChakra + pCorpo) / 3) + bonusAscensao) * mPV) || 1,
            pmMax: Math.floor((((pMana + pAura + pStatus) / 3) + bonusAscensao) * mPM) || 1,
            forcaMax: Math.floor((((Number(minhaFicha?.mana?.base) || 0) + (Number(minhaFicha?.aura?.base) || 0) + (Number(minhaFicha?.chakra?.base) || 0) + (Number(minhaFicha?.corpo?.base) || 0)) / 4) * fatorForca) || 1
        };
    };
    const { pvMax, pmMax, forcaMax } = getSupremas();

    const handleRegenerarTudo = () => {
        if (!window.confirm('Recuperar toda a Vida, Energias, Pontos e Ações de Turno?')) return;
        updateFicha(f => {
            ['vida', 'mana', 'aura', 'chakra', 'corpo'].forEach(k => {
                let mx = safeGetMaximo(minhaFicha, k) * (fatoresVitaisAtual[k] || 1);
                let mxEstavel = safeGetMaximoSemFormas(minhaFicha, k) * (fatoresVitaisAtual[k] || 1);
                // 🩸 Vida cura até a SOMA de todas as barras (getTetoVida, core/vitals.js), não só uma.
                const teto = getTetoVida(mx, k, mxEstavel);
                f[k] = { ...f[k], atual: teto || 0 };
            });
            f.pv = { ...f.pv, atual: pvMax || 0 }; f.pm = { ...f.pm, atual: pmMax || 0 }; f.energiaForca = { ...f.energiaForca, atual: forcaMax || 0 };
            ['padrao', 'bonus', 'reacao'].forEach(tipo => { if (!f.acoes) f.acoes = {}; if (!f.acoes[tipo]) f.acoes[tipo] = { max: 1, atual: 1 }; f.acoes[tipo].atual = f.acoes[tipo].max; });
            if (f.combate) { f.combate.fadigaTurnos = 0; f.combate.fadigaExtra = 0; f.combate.municoTurnos = 0; }
        });
        callSave();
    };

    // 😮‍💨 FADIGA DE COMBATE: desgaste que se acumula a cada turno/grande gasto e
    // reduz o Poder Calculado do Scouter (poderGlobal acima). Guardada como
    // contagem de turnos + taxa por turno (não a % final) pra a taxa poder ser
    // ajustada a qualquer momento sem perder o histórico de turnos já passados.
    // fadigaExtra soma os pontos ganhos AUTOMATICAMENTE no Mapa (energia gasta, vida perdida,
    // Formas ativas — ver core/fadiga.js e MapaFormContext.jsx) em cima do contador manual.
    const fadigaTurnos = minhaFicha.combate?.fadigaTurnos || 0;
    const fadigaPorTurno = minhaFicha.combate?.fadigaPorTurno ?? 5;
    const fadigaExtraAtual = Math.max(0, Number(minhaFicha.combate?.fadigaExtra) || 0);
    // Arredondado só pra exibição — o cálculo real do Poder (dentro do useMemo acima) usa
    // calcularFadigaAtual sem arredondar, então a redução do Poder continua precisa.
    const fadigaAtual = Math.round(calcularFadigaAtual(minhaFicha));

    const updateFadigaTurnos = (delta) => {
        updateFicha(f => {
            if (!f.combate) f.combate = {};
            f.combate.fadigaTurnos = Math.max(0, (Number(f.combate.fadigaTurnos) || 0) + delta);
        });
        callSave();
    };

    const zerarFadiga = () => {
        updateFicha(f => { if (!f.combate) f.combate = {}; f.combate.fadigaTurnos = 0; f.combate.fadigaExtra = 0; });
        callSave();
    };

    return (
        <div style={{
            width: '95%', maxWidth: '1200px', margin: '0 auto', minHeight: '100%', height: 'auto',
            backgroundColor: localCorFundo, color: localCorTexto, fontFamily: fonteDiario,
            padding: '40px 40px 80px 40px', borderRadius: '12px', position: 'relative', transition: 'background 0.3s ease, color 0.3s ease',
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.1), 0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
            overflow: 'visible'
        }}>
            {localBgImg && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none', borderRadius: '12px', overflow: 'hidden', mixBlendMode: localModoFundo, isolation: 'isolate' }}>
                    <img src={localBgImg} alt="Fundo" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, filter: localModoFundo !== 'normal' ? 'contrast(1.2) saturate(1.2)' : 'none' }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: localCorFundoTint, mixBlendMode: 'color', opacity: 0.85 }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: localCorFundoTint, mixBlendMode: 'multiply', opacity: 0.5 }} />
                </div>
            )}

            <style>{`
                .swoop-container { transform-style: preserve-3d; z-index: 1; position: relative; }
                @keyframes pageSwoopNext { 0% { transform: perspective(1500px) rotateY(-15deg) translateX(30px) scale(0.98); opacity: 0; } 100% { transform: perspective(1500px) rotateY(0deg) translateX(0) scale(1); opacity: 1; } }
                @keyframes pageSwoopPrev { 0% { transform: perspective(1500px) rotateY(15deg) translateX(-30px) scale(0.98); opacity: 0; } 100% { transform: perspective(1500px) rotateY(0deg) translateX(0) scale(1); opacity: 1; } }
                .page-swoop-next { animation: pageSwoopNext 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
                .page-swoop-prev { animation: pageSwoopPrev 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }

                .grimorio-estilo-papel { --tinta: ${localCorTinta || '#000'}; --fundo: ${localCorFundo || '#fff'}; color: var(--tinta) !important; }
                .grimorio-estilo-papel * { font-family: ${fonteDiario}, 'Courier New', serif !important; text-shadow: none !important; box-shadow: none !important; }
                .grimorio-estilo-papel .def-box, .grimorio-estilo-papel [style*="background: rgba"] { background: transparent !important; border: 2px solid var(--tinta) !important; border-radius: 2px 255px 3px 25px / 255px 5px 225px 3px !important; position: relative; }
                .grimorio-estilo-papel .def-box::before, .grimorio-estilo-papel [style*="background: rgba"]::before { content: ''; position: absolute; top:0; left:0; right:0; bottom:0; background: var(--tinta); opacity: 0.03; pointer-events: none; border-radius: inherit; }
                .grimorio-estilo-papel h2, .grimorio-estilo-papel h3, .grimorio-estilo-papel h4 { color: var(--tinta) !important; display: inline-block; }
                .grimorio-estilo-papel button { background: transparent !important; border: 2px dashed var(--tinta) !important; border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px !important; color: var(--tinta) !important; font-weight: bold !important; text-transform: uppercase !important; transition: all 0.2s ease !important; }
                .grimorio-estilo-papel button:hover { background: var(--tinta) !important; color: var(--fundo) !important; border-style: solid !important; transform: scale(1.02) rotate(-1deg) !important; }
                .grimorio-estilo-papel input, .grimorio-estilo-papel textarea, .grimorio-estilo-papel select { background: rgba(0,0,0,0.03) !important; border: none !important; border-bottom: 2px dotted var(--tinta) !important; color: var(--tinta) !important; border-radius: 0 !important; outline: none !important; }
                .grimorio-estilo-papel input:focus, .grimorio-estilo-papel textarea:focus { background: rgba(0,0,0,0.06) !important; border-bottom: 2px solid var(--tinta) !important; }
                .grimorio-estilo-papel input::placeholder, .grimorio-estilo-papel textarea::placeholder { color: var(--tinta) !important; opacity: 0.5 !important; font-style: italic !important; }
            `}</style>

            <div style={{ position: 'absolute', top: '-25px', right: '30px', zIndex: 20, display: 'flex', gap: '15px' }}>
                <div style={{ position: 'relative' }}>
                    <button onClick={handleSalvarTudo} disabled={estadoSalvar === 'salvando'} style={{ background: estadoSalvar === 'erro' ? '#e57373' : estadoSalvar === 'salvo' ? '#a5d6a7' : estadoSalvar === 'salvando' ? '#ffd54f' : '#4caf50', color: '#fff', border: '1px solid #333', borderBottom: '3px solid #222', padding: '10px 20px', fontFamily: 'inherit', fontWeight: 'bold', fontSize: '1.1em', cursor: estadoSalvar === 'salvando' ? 'default' : 'pointer', borderRadius: '4px', boxShadow: '2px 4px 8px rgba(0,0,0,0.4)', transform: 'rotate(1deg)' }}>
                        {estadoSalvar === 'salvando' ? '⏳ Guardando...' : estadoSalvar === 'salvo' ? '✅ Guardado!' : estadoSalvar === 'erro' ? '⚠️ Erro ao Guardar!' : '💾 Guardar Ficha'}
                    </button>
                </div>
                <div style={{ position: 'relative' }}>
                    <button onClick={() => { setModalEstilo(!modalEstilo); setModalImport(false); }} style={{ background: '#ff94c2', color: '#000', border: '1px solid #333', borderBottom: '3px solid #222', padding: '10px 20px', fontFamily: 'inherit', fontWeight: 'bold', fontSize: '1.1em', cursor: 'pointer', borderRadius: '4px', boxShadow: '2px 4px 8px rgba(0,0,0,0.4)', transform: 'rotate(-2deg)' }}>🎨 Estilo</button>
                    {modalEstilo && (
                        <div className="fade-in" style={{ position: 'absolute', top: '55px', right: '0', background: '#ffe4f0', padding: '15px', border: '1px solid #ccc', boxShadow: '5px 5px 15px rgba(0,0,0,0.3)', width: '320px', zIndex: 20, borderRadius: '6px', color: '#000', maxHeight: '75vh', overflowY: 'auto' }}>
                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', fontWeight: 'bold' }}>Cor do Texto da Ficha:</label>
                            <input type="color" value={localCorTexto} onChange={(e) => handleStyleChange('corTexto', e.target.value)} style={{ width: '100%', height: '40px', border: 'none', cursor: 'pointer', marginBottom: '15px', background: 'transparent' }} />
                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', fontWeight: 'bold' }}>Cor do Papel (Fundo Base):</label>
                            <input type="color" value={localCorFundo} onChange={(e) => handleStyleChange('diarioCor', e.target.value)} style={{ width: '100%', height: '40px', border: 'none', cursor: 'pointer', marginBottom: '15px', background: 'transparent' }} />
                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', fontWeight: 'bold' }}>🖼️ Imagem de Fundo (URL):</label>
                            <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                <input type="text" value={localBgImg} onChange={(e) => handleStyleChange('bgImg', e.target.value)} placeholder="Cole o Link aqui..." style={{ flex: 1, padding: '8px', border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', color: 'inherit' }} />
                                <button onClick={() => handleStyleChange('bgImg', '')} style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid red', color: 'red', cursor: 'pointer', padding: '0 8px', fontWeight: 'bold', borderRadius: '4px' }} title="Remover Imagem">✖</button>
                                <label style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.2)', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Fazer upload de Fundo">
                                    📁<input type="file" accept="image/*" onChange={handleBgUpload} style={{ display: 'none' }} />
                                </label>
                            </div>
                            <select value={localModoFundo} onChange={(e) => handleStyleChange('modoFundo', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', fontFamily: 'inherit', marginBottom: '5px' }}>
                                <option value="normal">Fundo Normal</option>
                                <option value="screen">Apagar Preto (Screen)</option>
                                <option value="multiply">Apagar Branco (Multiply)</option>
                            </select>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9em', marginBottom: '15px', color: '#555', fontWeight: 'bold' }}>
                                <span>Tingir Fundo:</span>
                                <input type="color" value={localCorFundoTint} onChange={(e) => handleStyleChange('corFundoTint', e.target.value)} style={{ width: '40px', height: '25px', border: 'none', cursor: 'pointer', background: 'transparent' }} />
                            </label>
                            <hr style={{ border: '1px dashed #ccc', margin: '15px 0' }}/>
                            
                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', fontWeight: 'bold' }}>✨ Moldura do Personagem:</label>
                            <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                <input type="text" value={localMolduraAvatar} onChange={(e) => handleStyleChange('molduraAvatar', e.target.value)} placeholder="Cole o Link da moldura..." style={{ flex: 1, padding: '8px', border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', color: 'inherit' }} />
                                <button onClick={() => handleStyleChange('molduraAvatar', '')} style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid red', color: 'red', cursor: 'pointer', padding: '0 8px', fontWeight: 'bold', borderRadius: '4px' }} title="Remover Moldura">✖</button>
                                <label style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.2)', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Upload de Moldura">
                                    📁<input type="file" accept="image/*" onChange={handleMolduraUpload} style={{ display: 'none' }} />
                                </label>
                            </div>
                            <select value={localModoMoldura} onChange={(e) => handleStyleChange('modoMoldura', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', fontFamily: 'inherit', marginBottom: '10px' }}>
                                <option value="screen">Fundo Preto (Magia Screen)</option>
                                <option value="multiply">Fundo Branco (Magia Multiply)</option>
                                <option value="normal">Nenhum / Imagem PNG Transparente</option>
                            </select>
                            
                            {/* 🔥 NOVA PALETA PREMIUM NAS BORDAS 🔥 */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9em', color: '#555', marginTop: '10px', fontWeight: 'bold' }}>
                                <span>Tingir Moldura & Ícone:</span>
                                <input type="color" value={localCorMoldura} onChange={(e) => handleStyleChange('corMoldura', e.target.value)} style={{ width: '40px', height: '25px', border: 'none', cursor: 'pointer', background: 'transparent' }} title="Tinge o dourado/metálico da moldura!" />
                            </label>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '15px', marginTop: '5px' }}>
                                {PALETA_PREMIUM.map(p => (
                                    <div key={`moldura-${p.cor}`} onClick={() => handleStyleChange('corMoldura', p.cor)} style={{ width: '24px', height: '24px', backgroundColor: p.cor, border: localCorMoldura === p.cor ? '2px solid #000' : '1px solid rgba(0,0,0,0.5)', cursor: 'pointer', borderRadius: '50%', boxShadow: `0 0 8px ${p.cor}80` }} title={`Pintar de ${p.nome}`} />
                                ))}
                            </div>

                            {/* 🔥 NOVOS REGULADORES DE PINTURA E BRILHO DA MOLDURA 🔥 */}
                            <div style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.1)', padding: '10px', borderRadius: '6px', marginBottom: '15px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85em', color: '#555', fontWeight: 'bold' }}>
                                    <span>🎨 Intensidade da Cor:</span>
                                    <input type="range" min="0" max="100" value={localMolduraOpColor * 100} onChange={(e) => handleStyleChange('molduraOpColor', parseInt(e.target.value) / 100)} style={{ flex: 1, accentColor: localCorMoldura !== '#ffffff' ? localCorMoldura : '#000', cursor: 'pointer' }} />
                                    <span style={{ width: '35px', textAlign: 'right' }}>{Math.round(localMolduraOpColor * 100)}%</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85em', color: '#555', marginTop: '5px', fontWeight: 'bold' }}>
                                    <span>🌑 Escurecimento (Sombra):</span>
                                    <input type="range" min="0" max="100" value={localMolduraOpMultiply * 100} onChange={(e) => handleStyleChange('molduraOpMultiply', parseInt(e.target.value) / 100)} style={{ flex: 1, accentColor: localCorMoldura !== '#ffffff' ? localCorMoldura : '#000', cursor: 'pointer' }} />
                                    <span style={{ width: '35px', textAlign: 'right' }}>{Math.round(localMolduraOpMultiply * 100)}%</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85em', color: '#555', marginTop: '5px', fontWeight: 'bold' }}>
                                    <span>✨ Brilho Metálico (Luz):</span>
                                    <input type="range" min="0" max="100" value={localMolduraOpOverlay * 100} onChange={(e) => handleStyleChange('molduraOpOverlay', parseInt(e.target.value) / 100)} style={{ flex: 1, accentColor: localCorMoldura !== '#ffffff' ? localCorMoldura : '#000', cursor: 'pointer' }} />
                                    <span style={{ width: '35px', textAlign: 'right' }}>{Math.round(localMolduraOpOverlay * 100)}%</span>
                                </label>
                            </div>
                            
                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', fontWeight: 'bold' }}>🔷 Ícone da Classe Manual (Opcional):</label>
                            <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                                <input type="text" value={localIconeClasse} onChange={(e) => handleStyleChange('iconeClasse', e.target.value)} placeholder="Link do Ícone..." style={{ flex: 1, padding: '8px', border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', color: 'inherit' }} />
                                <button onClick={() => handleStyleChange('iconeClasse', '')} style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid red', color: 'red', cursor: 'pointer', padding: '0 8px', fontWeight: 'bold', borderRadius: '4px' }} title="Remover Ícone">✖</button>
                                <label style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.2)', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Upload do Ícone">
                                    📁<input type="file" accept="image/*" onChange={handleIconeUpload} style={{ display: 'none' }} />
                                </label>
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9em', color: '#555', marginBottom: '15px', fontWeight: 'bold' }}>
                                <span>↕️ Ajuste Vertical do Ícone:</span>
                                <input type="range" min="-100" max="50" value={localIconeOffsetY} onChange={(e) => handleStyleChange('iconeOffsetY', parseInt(e.target.value))} style={{ flex: 1, accentColor: localCorMoldura !== '#ffffff' ? localCorMoldura : '#000', cursor: 'pointer' }} />
                                <span style={{ width: '40px', textAlign: 'right' }}>{localIconeOffsetY}px</span>
                            </label>

                            <hr style={{ border: '1px dashed #ccc', margin: '15px 0' }}/>
                            
                            {/* 🔥 NOVA PALETA PREMIUM NA TINTA DO RADAR 🔥 */}
                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', fontWeight: 'bold' }}>Cor da Tinta (Radar/Textos):</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                <input type="color" value={localCorTinta} onChange={(e) => handleStyleChange('corTintaRadar', e.target.value)} style={{ width: '40px', height: '25px', border: 'none', cursor: 'pointer', background: 'transparent' }} />
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {PALETA_PREMIUM.map(p => (
                                        <div key={`tinta-${p.cor}`} onClick={() => handleStyleChange('corTintaRadar', p.cor)} style={{ width: '18px', height: '18px', backgroundColor: p.cor, border: localCorTinta === p.cor ? '2px solid #000' : '1px solid rgba(0,0,0,0.5)', cursor: 'pointer', borderRadius: '50%' }} title={`Tinta ${p.nome}`} />
                                    ))}
                                </div>
                            </div>
                            
                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', fontWeight: 'bold' }}>Fonte da Letra:</label>
                            <select value={fonteDiario} onChange={(e) => { salvar('estetica.diarioFonte', e.target.value); callSave(); }} style={{ width: '100%', padding: '8px', border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', fontFamily: 'inherit' }}>
                                <option value='"Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive'>✏️ Escrito à Mão</option>
                                <option value="'Courier New', Courier, monospace">🖨️ Máquina de Escrever</option>
                                <option value="'Times New Roman', Times, serif">📖 Grimório Clássico</option>
                            </select>
                        </div>
                    )}
                </div>
            </div>

            <div key={paginaAtual} className={`swoop-container ${animDirection === 'next' ? 'page-swoop-next' : 'page-swoop-prev'}`} style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '40px', paddingBottom: '30px' }}>
                
                {paginaAtual === 1 && (
                    <>
                        <div style={{ flex: '1 1 450px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', borderBottom: '2px solid currentColor', paddingBottom: '5px', marginBottom: '10px', width: 'fit-content' }}>
                                <span style={{ fontSize: '3.5em', fontStyle: 'italic', fontWeight: 'bold', margin: 0 }}>/</span>
                                <CampoMagico valor={minhaFicha.bio?.apelido !== undefined ? minhaFicha.bio.apelido : meuNome} onChange={(v) => salvar('bio.apelido', v)} placeholder="Nome" styleExtra={{ fontSize: '3.5em', fontStyle: 'italic', fontWeight: 'bold', minWidth: '300px', width: 'auto', borderBottom: 'none' }} />
                                <span style={{ fontSize: '3.5em', fontStyle: 'italic', fontWeight: 'bold', margin: 0 }}>©</span>
                            </div>
                            <h2 style={{ fontSize: '2.2em', fontStyle: 'italic', fontWeight: 'bold', margin: '0 0 20px 0', display: 'flex', alignItems: 'center' }}>
                                <LabelMagico valor={getLabel('tituloLv', '- Limite quebrado - LV')} onChange={(v) => setLabel('tituloLv', v)} />
                                <CampoMagico valor={minhaFicha.bio?.nivel} onChange={(v) => salvar('bio.nivel', v)} styleExtra={{ width: '60px', borderBottom: 'none', marginLeft: '10px' }} isNumber={true} type="number" />
                            </h2>

                            {/* 🌟 SCOUTER HOLOGRÁFICO BLINDADO 🌟 */}
                            <div style={{
                                marginTop: '15px', marginBottom: '25px', padding: '25px 30px',
                                background: 'rgba(15, 15, 20, 0.75)',
                                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                                border: '1px solid rgba(255, 255, 255, 0.1)', borderTop: '1px solid rgba(255, 255, 255, 0.25)', borderLeft: `4px solid ${temaScouter.cor}`,
                                borderRadius: '6px 12px 12px 6px',
                                boxShadow: `0 15px 35px rgba(0,0,0,0.6), inset -5px -5px 20px rgba(0,0,0,0.8), inset 0 0 40px ${temaScouter.cor}1a`,
                                display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden'
                            }}>
                                <div style={{ position: 'absolute', bottom: '-40%', right: '-10%', width: '300px', height: '300px', background: `radial-gradient(circle, ${temaScouter.cor}22 0%, transparent 70%)`, borderRadius: '50%', pointerEvents: 'none', animation: `pulse-aura ${temaScouter.pulse} ease-in-out infinite` }} />

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 1, position: 'relative' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <div style={{ width: '8px', height: '8px', background: temaScouter.cor, borderRadius: '50%', boxShadow: `0 0 10px ${temaScouter.cor}, 0 0 20px ${temaScouter.cor}` }} />
                                            <span style={{ color: '#fff', opacity: 0.8, fontSize: '0.8em', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '4px' }}>
                                                {temaScouter.nome}
                                            </span>
                                        </div>
                                        
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '15px' }}>
                                            <span style={{
                                                fontSize: '3.2em', fontWeight: '900', letterSpacing: '-1px',
                                                color: '#ffffff',
                                                textShadow: `0 0 10px ${temaScouter.glow}, 0 0 20px ${temaScouter.glow}, 0 0 40px ${temaScouter.glow}`
                                            }}>
                                                {formatarPoderCosmico(isNaN(poderGlobal) ? 0 : poderGlobal)}
                                            </span>
                                            <span style={{ fontSize: '0.5em', color: '#fff', opacity: 0.6, fontWeight: 'bold', letterSpacing: '1px' }}>
                                                {Number(isNaN(poderGlobal) ? 0 : poderGlobal).toExponential(2).replace('+', '').toUpperCase()}
                                            </span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingLeft: '20px' }}>
                                        <span style={{ color: '#fff', opacity: 0.6, fontSize: '0.65em', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '8px' }}>Grau Vital</span>
                                        <div style={{
                                            fontSize: '2.5em', fontWeight: '900', color: temaScouter.cor,
                                            background: 'rgba(0,0,0,0.6)',
                                            padding: '8px 25px', borderRadius: '8px',
                                            border: `1px solid ${temaScouter.cor}55`,
                                            boxShadow: `inset 0 0 15px ${temaScouter.cor}33, 0 5px 15px rgba(0,0,0,0.5)`,
                                            lineHeight: '1', textShadow: `0 0 10px ${temaScouter.cor}`
                                        }}>
                                            V{isNaN(vitalidadeGlobal) ? 0 : vitalidadeGlobal}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '15px', position: 'relative', zIndex: 1, borderTop: `1px solid rgba(255,255,255,0.05)`, paddingTop: '15px' }}>
                                    <span style={{ color: '#fff', opacity: 0.7, fontSize: '0.8em', fontWeight: 'bold', textTransform: 'uppercase' }}>Ocultar Presença:</span>
                                    <input 
                                        type="range" min={Math.min(limiteSupressao, 100)} max="100" step="0.1" value={supressao > 100 ? 100 : supressao}
                                        onChange={e => { salvar('supressaoPoder', e.target.value); }}
                                        style={{ flex: 1, accentColor: temaScouter.cor, cursor: 'pointer', filter: `drop-shadow(0 0 5px ${temaScouter.cor})` }}
                                    />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <input 
                                            type="number" min={limiteSupressao} max="100" step="any" value={supressao}
                                            onChange={e => {
                                                let val = Number(e.target.value);
                                                if (isNaN(val)) val = limiteSupressao;
                                                if (val < limiteSupressao) val = limiteSupressao;
                                                salvar('supressaoPoder', val);
                                            }}
                                            style={{ width: '80px', background: 'rgba(0,0,0,0.5)', color: temaScouter.cor, border: `1px solid ${temaScouter.cor}`, padding: '4px', borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', outline: 'none' }}
                                        />
                                        <span style={{ color: temaScouter.cor, fontWeight: 'bold', fontSize: '1.1em' }}>%</span>
                                    </div>
                                </div>

                                {isMestre && (
                                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255, 0, 60, 0.1)', padding: '8px', borderRadius: '6px', border: '1px dashed rgba(255, 0, 60, 0.5)' }}>
                                        <span style={{ color: '#ff003c', fontSize: '0.8em', fontWeight: 'bold', textTransform: 'uppercase' }}>🔒 Controle do GM (Limite de Ocultação):</span>
                                        <input 
                                            type="number" min="0.000001" step="any" value={limiteSupressao}
                                            onChange={e => { salvar('limiteSupressao', e.target.value); }}
                                            style={{ width: '80px', background: 'rgba(0,0,0,0.8)', color: '#ff003c', border: '1px solid #ff003c', padding: '4px', borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', outline: 'none' }}
                                        />
                                        <span style={{ color: '#ff003c', fontWeight: 'bold', fontSize: '1em' }}>%</span>
                                    </div>
                                )}

                                {isMestre && (
                                    <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', background: 'rgba(255, 0, 60, 0.1)', padding: '8px', borderRadius: '6px', border: '1px dashed rgba(255, 0, 60, 0.5)' }}>
                                        <span style={{ color: '#ff003c', fontSize: '0.8em', fontWeight: 'bold', textTransform: 'uppercase' }}>🔒 Divisor de Poder (Este Personagem):</span>
                                        <input
                                            type="number" min="0" step="any"
                                            placeholder={`Padrão (÷${divisorPoderMesa})`}
                                            value={parseFloat(minhaFicha.divisorPoder) > 0 ? minhaFicha.divisorPoder : ''}
                                            onChange={e => { salvar('divisorPoder', e.target.value === '' ? 0 : e.target.value); }}
                                            style={{ width: '110px', background: 'rgba(0,0,0,0.8)', color: '#ff003c', border: '1px solid #ff003c', padding: '4px', borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', outline: 'none' }}
                                        />
                                        <span style={{ color: '#ff003c', opacity: 0.6, fontSize: '0.75em' }}>(vazio = usa o padrão da mesa)</span>
                                    </div>
                                )}

                                {isMestre && (
                                    <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', background: 'rgba(255, 0, 60, 0.1)', padding: '8px', borderRadius: '6px', border: '1px dashed rgba(255, 0, 60, 0.5)' }}>
                                        <span style={{ color: '#ff003c', fontSize: '0.8em', fontWeight: 'bold', textTransform: 'uppercase' }}>🔒 Divisor de Poder Padrão (Todos os Jogadores):</span>
                                        <input
                                            type="number" min="0.000001" step="any"
                                            value={divisorPoderMesa}
                                            onChange={e => { salvarDivisorPoderMesaHandler(e.target.value); }}
                                            style={{ width: '110px', background: 'rgba(0,0,0,0.8)', color: '#ff003c', border: '1px solid #ff003c', padding: '4px', borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', outline: 'none' }}
                                        />
                                        <span style={{ color: '#ff003c', opacity: 0.6, fontSize: '0.75em' }}>(aplicado a todo mundo que não tiver um divisor próprio)</span>
                                    </div>
                                )}
                                <style>{` @keyframes pulse-aura { 0% { opacity: 0.3; transform: scale(0.9); } 50% { opacity: 0.8; transform: scale(1.1); } 100% { opacity: 0.3; transform: scale(0.9); } } `}</style>
                            </div>

                            {/* 😮‍💨 FADIGA DE COMBATE (DESGASTE POR TURNO) */}
                            <div style={{ marginTop: '15px', border: '2px solid #ff8800', padding: '20px', borderRadius: '8px', background: 'rgba(255,136,0,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px dotted #ff8800', paddingBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '1.4em', display: 'flex', alignItems: 'center', gap: '10px', color: '#ff8800' }}>😮‍💨 Fadiga de Combate</h2>
                                        <span style={{ fontSize: '0.85em', opacity: 0.8, fontStyle: 'italic' }}>A cada turno (ou grande gasto) o cansaço se acumula e reduz o Poder Calculado no Scouter. No Mapa, o retorno do seu turno já soma isso sozinho — mais rápido quanto mais Energia gasta e Vida perdida você tiver, escalado pelo quanto do seu Poder está liberado (Supressão do Scouter): usando pouco Poder gera pouca Fadiga, usando 100% gera o máximo. Formas ativas também pesam, mas cada ponto de Maestria naquela Forma (editável junto dela) reduz esse peso — 100% de Maestria numa Forma zera a Fadiga que ela gera. Overcharge de Técnicas Elementais também soma um pouco na hora, descontado pelo Domínio (página 3) do elemento usado — e um Domínio bem treinado ainda reduz a Fadiga de dano recebido daquele mesmo elemento. "Turnos Cansativos" ao lado é só um contador informativo, não gera Fadiga sozinho.{fadigaExtraAtual > 0 ? ` (+${fadigaExtraAtual.toFixed(1)}% ganhos automáticos no Mapa até agora)` : ''}</span>
                                    </div>
                                    <button onClick={zerarFadiga} style={{ padding: '8px 15px', border: '1px solid #ff8800', color: '#ff8800', background: 'transparent', cursor: 'pointer', opacity: 0.8, borderRadius: '4px' }}>🧹 Zerar Fadiga</button>
                                </div>

                                <div style={{ display: 'flex', gap: '20px', alignItems: 'stretch', flexWrap: 'wrap' }}>
                                    <div style={{ flex: '1 1 200px', background: 'rgba(0,0,0,0.03)', borderRadius: '6px', padding: '15px', border: '1px dashed #ff8800' }}>
                                        <span style={{ fontSize: '0.8em', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.7, color: '#ff8800' }}>Fadiga por Turno (%)</span>
                                        <CampoMagico valor={fadigaPorTurno} onChange={v => { const n = Number(v); if (isNaN(n)) return; updateFicha(f => { if (!f.combate) f.combate = {}; f.combate.fadigaPorTurno = n; }); callSave(); }} type="number" styleExtra={{ fontSize: '1.1em', fontWeight: 'bold', borderBottomColor: '#ff8800', color: '#ff8800' }} />
                                    </div>

                                    <div style={{ flex: '1 1 200px', background: 'rgba(0,0,0,0.03)', borderRadius: '6px', padding: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed #ff8800' }}>
                                        <span style={{ fontSize: '0.8em', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.7, color: '#ff8800' }} title="Sobe sozinho a cada turno no Mapa, só como contagem informativa de quanto tempo a luta dura — não gera Fadiga por si só, isso vem da % dinâmica ao lado. Editável manualmente aqui se precisar corrigir.">Turnos Cansativos</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginTop: '5px' }}>
                                            <button onClick={() => updateFadigaTurnos(-1)} style={{ background: 'transparent', border: '1px solid #ff8800', color: '#ff8800', fontSize: '1.4em', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer' }}>-</button>
                                            <span style={{ fontSize: '1.6em', fontWeight: 'bold', minWidth: '30px', textAlign: 'center' }}>{fadigaTurnos}</span>
                                            <button onClick={() => updateFadigaTurnos(1)} style={{ background: 'transparent', border: '1px solid #ff8800', color: '#ff8800', fontSize: '1.4em', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer' }}>+</button>
                                        </div>
                                    </div>

                                    <div style={{ flex: '1 1 200px', background: 'rgba(255,136,0,0.08)', border: '1px solid #ff8800', borderRadius: '6px', padding: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                                        <span style={{ fontSize: '0.85em', color: '#ff8800', fontWeight: 'bold', textTransform: 'uppercase' }}>Fadiga Atual</span>
                                        <span style={{ fontSize: '2em', fontWeight: '900', color: '#ff8800' }}>{fadigaAtual}%</span>
                                        <span style={{ fontSize: '0.8em', opacity: 0.7 }}>Poder Calculado reduzido em {fadigaAtual}%</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '1.2em' }}>
                                {[{ k: 'idade', lbl: 'Idade' }, { k: 'aniversario', lbl: 'Aniversário' }, { k: 'alturaPeso', lbl: 'Altura / Peso' }, { k: 'raca', lbl: 'Raça' }, { k: 'alinhamento', lbl: 'Alinhamento' }, { k: 'afiliacao', lbl: 'Afiliação' }, { k: 'classe', lbl: 'Classe' }].map(item => (
                                    <div key={item.k} style={{ display: 'flex' }}>
                                        <div style={{ width: '140px', fontWeight: 'bold' }}>
                                            <LabelMagico valor={getLabel(`bio_${item.k}`, item.lbl)} onChange={(v) => setLabel(`bio_${item.k}`, v)} />
                                        </div>
                                        <span style={{ fontWeight: 'bold', marginRight: '8px' }}>:</span>
                                        {item.k === 'classe' ? (
                                            <select value={minhaFicha.bio?.classe || ''} onChange={(e) => { salvar('bio.classe', e.target.value); }}
                                                style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px dotted currentColor', fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', fontWeight: 'inherit', outline: 'none', padding: '0 5px' }}>
                                                {CLASSE_SELECT_OPTIONS.map(opt => <option key={opt.id} value={opt.id} style={{ color: '#000' }}>{opt.icone ? `${opt.icone} ${opt.nome}` : opt.nome}</option>)}
                                            </select>
                                        ) : (
                                            <CampoMagico valor={minhaFicha.bio?.[item.k]} onChange={(v) => salvar(`bio.${item.k}`, v)} styleExtra={{ flex: 1, borderBottom: '1px dotted currentColor' }} />
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* 🔥 AVATAR COM DUPLA CAMADA DE TINTA (MÁSCARAS OU SCREEN COM SUPORTE TOTAL AOS SLIDERS) 🔥 */}
                            <div style={{ 
                                marginTop: '20px', position: 'relative', width: '320px', height: '480px', display: 'flex', flexDirection: 'column', 
                                borderRadius: '8px', 
                                border: minhaFicha.avatar?.base ? 'none' : '2px dashed currentColor',
                                boxShadow: minhaFicha.avatar?.base ? '8px 8px 0px rgba(0,0,0,0.4)' : 'none',
                                isolation: 'isolate'
                            }}>
                                {uploadingImg ? (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', color: '#fff', fontWeight: 'bold', zIndex: 20 }}>✍️ Forjando...</div>
                                ) : minhaFicha.avatar?.base ? (
                                    <>
                                        <img src={minhaFicha.avatar.base} alt="Avatar" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', zIndex: 1, borderRadius: '8px' }} />
                                        
                                        {localMolduraAvatar && (
                                            <div style={{ position: 'absolute', top: '-3.5%', left: '-3%', width: '106%', height: '107%', zIndex: 2, pointerEvents: 'none', mixBlendMode: localModoMoldura, isolation: 'isolate' }}>
                                                <img src={localMolduraAvatar} alt="Moldura" style={{ width: '100%', height: '100%', objectFit: 'fill', position: 'absolute', top: 0, left: 0, filter: 'contrast(1.2) saturate(1.2)' }} />
                                                
                                                {localCorMoldura !== '#ffffff' && (
                                                    <>
                                                        {localModoMoldura === 'normal' ? (
                                                            <>
                                                                <div style={{ position: 'absolute', inset: 0, backgroundColor: localCorMoldura, mixBlendMode: 'multiply', opacity: localMolduraOpMultiply, WebkitMaskImage: `url('${localMolduraAvatar}')`, WebkitMaskSize: '100% 100%', WebkitMaskRepeat: 'no-repeat', maskImage: `url('${localMolduraAvatar}')`, maskSize: '100% 100%', maskRepeat: 'no-repeat' }} />
                                                                <div style={{ position: 'absolute', inset: 0, backgroundColor: localCorMoldura, mixBlendMode: 'color', opacity: localMolduraOpColor, WebkitMaskImage: `url('${localMolduraAvatar}')`, WebkitMaskSize: '100% 100%', WebkitMaskRepeat: 'no-repeat', maskImage: `url('${localMolduraAvatar}')`, maskSize: '100% 100%', maskRepeat: 'no-repeat' }} />
                                                                <div style={{ position: 'absolute', inset: 0, backgroundColor: localCorMoldura, mixBlendMode: 'overlay', opacity: localMolduraOpOverlay, WebkitMaskImage: `url('${localMolduraAvatar}')`, WebkitMaskSize: '100% 100%', WebkitMaskRepeat: 'no-repeat', maskImage: `url('${localMolduraAvatar}')`, maskSize: '100% 100%', maskRepeat: 'no-repeat' }} />
                                                            </>
                                                        ) : (
                                                            <>
                                                                <div style={{ position: 'absolute', inset: 0, backgroundColor: localCorMoldura, mixBlendMode: 'multiply', opacity: localMolduraOpMultiply }} />
                                                                <div style={{ position: 'absolute', inset: 0, backgroundColor: localCorMoldura, mixBlendMode: 'color', opacity: localMolduraOpColor }} />
                                                                <div style={{ position: 'absolute', inset: 0, backgroundColor: localCorMoldura, mixBlendMode: 'overlay', opacity: localMolduraOpOverlay }} />
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        {/* 🔥 SÍMBOLO DA CLASSE ALINHADO (DEFAULT -45PX) E COM SLIDER DE CONTROLO 🔥 */}
                                        {(classeInfo || localIconeClasse) && (
                                            <div style={{ position: 'absolute', bottom: `${localIconeOffsetY}px`, left: '50%', transform: 'translateX(-50%)', zIndex: 3, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '70px', height: '70px' }}>
                                                {iconeFinal ? (
                                                    <div style={{ position: 'relative', width: '100%', height: '100%', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))', isolation: 'isolate' }}>
                                                        <img src={iconeFinal} alt="Classe" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
                                                        
                                                        {localCorMoldura !== '#ffffff' && (
                                                            <>
                                                                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: localCorMoldura, mixBlendMode: 'multiply', opacity: localMolduraOpMultiply, WebkitMaskImage: `url("${iconeFinal}")`, WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskImage: `url("${iconeFinal}")`, maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center' }} />
                                                                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: localCorMoldura, mixBlendMode: 'color', opacity: localMolduraOpColor, WebkitMaskImage: `url("${iconeFinal}")`, WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskImage: `url("${iconeFinal}")`, maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center' }} />
                                                                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: localCorMoldura, mixBlendMode: 'overlay', opacity: localMolduraOpOverlay, WebkitMaskImage: `url("${iconeFinal}")`, WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskImage: `url("${iconeFinal}")`, maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center' }} />
                                                            </>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div style={{ width: '50px', height: '50px', background: glowColor, transform: 'rotate(45deg)', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.8)' }}>
                                                        <span style={{ transform: 'rotate(-45deg)', fontSize: '1.5em', textShadow: '0 2px 4px rgba(0,0,0,0.5)', color: '#fff' }}>{classeInfo?.icone || '👤'}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        
                                        <label style={{ cursor: 'pointer', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10 }}>
                                            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                                        </label>
                                    </>
                                ) : (
                                    <label style={{ cursor: 'pointer', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'currentColor', opacity: 0.7, background: 'rgba(255,255,255,0.1)' }}>
                                        Colar Fotografia Aqui 📸
                                        <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                                    </label>
                                )}
                            </div>
                            {minhaFicha.avatar?.base && <button onClick={() => {if(window.confirm('Apagar?')) { updateFicha(f => {f.avatar.base = ""}); callSave(); } }} style={{ background: 'transparent', border: '1px dashed #ff003c', color: '#ff003c', marginTop: '10px', padding: '5px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit', width: 'fit-content' }}>🗑️ Remover Foto</button>}
                        </div>

                        <div style={{ flex: '1 1 450px', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 10px 5px' }}>
                                <h2 style={{ fontSize: '2em', fontStyle: 'italic', fontWeight: 'bold', margin: 0, display: 'flex' }}>
                                    <LabelMagico valor={getLabel('tituloBase', '> STATUS PRINCIPAIS')} onChange={(v) => setLabel('tituloBase', v)} />
                                </h2>
                                <button onClick={handleRegenerarTudo} style={{ background: 'rgba(255,255,255,0.4)', border: '2px solid currentColor', padding: '5px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '2px 2px 5px rgba(0,0,0,0.2)' }} title="Recuperar toda a Vida, Energias e Ações">
                                    <span>💖</span> Descansar
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <LinhaVital labelKey="lblVida" fallbackLabel="Vida (HP)" vitalKey="vida" corBarra="#ff0000" ficha={minhaFicha} supressao={supressao} temaScouter={temaScouter} salvar={salvar} getLabel={getLabel} setLabel={setLabel} fator={fatoresVitaisAtual.vida} />
                                <LinhaVital labelKey="lblMana" fallbackLabel="Mana" vitalKey="mana" corBarra="#0000ff" ficha={minhaFicha} supressao={supressao} temaScouter={temaScouter} salvar={salvar} getLabel={getLabel} setLabel={setLabel} fator={fatoresVitaisAtual.mana} subItens={[ { labelKey: 'lblInt', fallbackLabel: 'Inteligência', key: 'inteligencia' }, { labelKey: 'lblSab', fallbackLabel: 'Sabedoria', key: 'sabedoria' } ]} />
                                <LinhaVital labelKey="lblAura" fallbackLabel="Aura" vitalKey="aura" corBarra="#aa00ff" ficha={minhaFicha} supressao={supressao} temaScouter={temaScouter} salvar={salvar} getLabel={getLabel} setLabel={setLabel} fator={fatoresVitaisAtual.aura} subItens={[ { labelKey: 'lblEsp', fallbackLabel: 'Energia Espiritual', key: 'energiaEsp' }, { labelKey: 'lblCar', fallbackLabel: 'Carisma', key: 'carisma' } ]} />
                                <LinhaVital labelKey="lblChakra" fallbackLabel="Chakra" vitalKey="chakra" corBarra="#00cc00" ficha={minhaFicha} supressao={supressao} temaScouter={temaScouter} salvar={salvar} getLabel={getLabel} setLabel={setLabel} fator={fatoresVitaisAtual.chakra} subItens={[ { labelKey: 'lblSta', fallbackLabel: 'Stamina', key: 'stamina' }, { labelKey: 'lblCon', fallbackLabel: 'Constituição', key: 'constituicao' } ]} />
                                <LinhaVital labelKey="lblCorpo" fallbackLabel="Corpo" vitalKey="corpo" corBarra="#000000" corTextoBarra="#fff" ficha={minhaFicha} supressao={supressao} temaScouter={temaScouter} salvar={salvar} getLabel={getLabel} setLabel={setLabel} fator={fatoresVitaisAtual.corpo} subItens={[ { labelKey: 'lblDes', fallbackLabel: 'Destreza', key: 'destreza' }, { labelKey: 'lblFor', fallbackLabel: 'Força', key: 'forca' } ]} />
                                <div style={{ marginBottom: '15px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', fontSize: '1.2em' }}>
                                            <LabelMagico valor={getLabel('lblEnergiaForca', 'Força')} onChange={(v) => setLabel('lblEnergiaForca', v)} />
                                        </div>
                                        <div style={{ fontSize: '0.85em', color: '#fff', border: `1px solid ${temaScouter.cor}`, padding: '2px 10px', borderRadius: '4px', background: temaScouter.bgDark, fontWeight: 'bold', boxShadow: `inset 0 0 8px ${temaScouter.cor}80` }}>
                                            Poder: {formatarPoderCosmico(getPoderVerdadeiro('energiaForca', minhaFicha, true, supressao, 1))}
                                        </div>
                                    </div>
                                    <BarraVital atual={minhaFicha.energiaForca?.atual !== undefined && minhaFicha.energiaForca?.atual !== '' ? Number(minhaFicha.energiaForca.atual) : forcaMax} maximo={forcaMax} pVit={0} cor="#FFD700" corTexto="#000" onChangeAtual={(v) => salvar('energiaForca.atual', v)} />
                                </div>
                            </div>

                            <h2 style={{ fontSize: '1.6em', fontStyle: 'italic', fontWeight: 'bold', margin: '20px 0 10px 5px', display: 'flex' }}>
                                <LabelMagico valor={getLabel('tituloPrimordial', '> ENERGIAS PRIMORDIAIS')} onChange={(v) => setLabel('tituloPrimordial', v)} />
                            </h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <div style={{ marginBottom: '5px' }}>
                                    <LabelMagico valor={getLabel('lblPV', 'Pontos Vitais (PV)')} onChange={(v) => setLabel('lblPV', v)} />
                                    <BarraVital atual={minhaFicha.pv?.atual !== undefined && minhaFicha.pv?.atual !== '' ? Number(minhaFicha.pv.atual) : pvMax} maximo={pvMax} pVit={0} cor="#ffffff" corTexto="#000" onChangeAtual={(v) => salvar('pv.atual', v)} />
                                </div>
                                <div style={{ marginBottom: '15px' }}>
                                    <LabelMagico valor={getLabel('lblPM', 'Pontos Mortais (PM)')} onChange={(v) => setLabel('lblPM', v)} />
                                    <BarraVital atual={minhaFicha.pm?.atual !== undefined && minhaFicha.pm?.atual !== '' ? Number(minhaFicha.pm.atual) : pmMax} maximo={pmMax} pVit={0} cor="#000000" corTexto="#fff" onChangeAtual={(v) => salvar('pm.atual', v)} />
                                </div>

                                <div style={{ display: 'flex', gap: '15px', marginTop: '5px' }}>
                                    <div style={{ flexS: 1, border: '2px solid currentColor', padding: '10px', borderRadius: '6px', background: 'rgba(255,255,255,0.2)' }}>
                                        <div style={{ fontSize: '0.8em', fontWeight: 'bold', textTransform: 'uppercase' }}><LabelMagico valor={getLabel('lblMultV', 'Mult. de Vida (PV)')} onChange={(v) => setLabel('lblMultV', v)} /></div>
                                        <CampoMagico valor={minhaFicha.multiplicadorVida || 1} onChange={(v) => salvar('multiplicadorVida', v)} type="number" isNumber={true} styleExtra={{ width: '100%', borderBottom: '1px solid currentColor', marginTop: '5px' }} />
                                    </div>
                                    <div style={{ flex: 1, border: '2px solid currentColor', padding: '10px', borderRadius: '6px', background: 'rgba(255,255,255,0.2)' }}>
                                        <div style={{ fontSize: '0.8em', fontWeight: 'bold', textTransform: 'uppercase' }}><LabelMagico valor={getLabel('lblMultM', 'Mult. de Morte (PM)')} onChange={(v) => setLabel('lblMultM', v)} /></div>
                                        <CampoMagico valor={minhaFicha.multiplicadorMorte || 1} onChange={(v) => salvar('multiplicadorMorte', v)} type="number" isNumber={true} styleExtra={{ width: '100%', borderBottom: '1px solid currentColor', marginTop: '5px' }} />
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginTop: '30px', border: '2px dashed currentColor', padding: '20px', borderRadius: '10px', position: 'relative' }}>
                                <span style={{ position: 'absolute', top: '-15px', left: '20px', background: localCorFundo, padding: '0 10px', fontSize: '1.2em', transition: 'background 0.2s ease' }}>
                                    <LabelMagico valor={getLabel('tituloTurno', 'Ações de Turno')} onChange={(v) => setLabel('tituloTurno', v)} />
                                </span>
                                <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginTop: '10px' }}>
                                    {['padrao', 'bonus', 'reacao'].map(tipo => {
                                        const acao = minhaFicha.acoes?.[tipo] || { max: 1, atual: 1 };
                                        const maxValSeguro = Math.max(0, parseInt(acao.max) || 1);
                                        return (
                                            <div key={tipo} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontSize: '1.1em' }}><LabelMagico valor={getLabel(`acao_${tipo}`, tipo.toUpperCase())} onChange={(v) => setLabel(`acao_${tipo}`, v)} /></span>
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                                    {Array.from({ length: maxValSeguro }).map((_, i) => (
                                                        <div key={i} onClick={() => { salvar(`acoes.${tipo}.atual`, i >= acao.atual ? acao.atual + 1 : acao.atual - 1); callSave(); }}
                                                            style={{ width: '25px', height: '25px', border: '2px solid currentColor', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1.2em', color: '#ff003c', background: 'rgba(255,255,255,0.2)' }}>
                                                            {i >= acao.atual ? 'X' : ''}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {paginaAtual === 2 && (
                    <>
                        <div style={{ width: '100%', textAlign: 'center', borderBottom: '2px solid currentColor', paddingBottom: '10px', marginBottom: '20px' }}>
                            <h1 style={{ fontSize: '3em', fontStyle: 'italic', fontWeight: 'bold', margin: '0', letterSpacing: '-1px' }}>
                                <LabelMagico valor={getLabel('tituloAnalise', 'Análise de Poder')} onChange={(v) => setLabel('tituloAnalise', v)} />
                            </h1>
                        </div>

                        <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(0,0,0,0.03)', padding: '20px', borderRadius: '15px', border: '1px dashed currentColor' }}>
                            <h2 style={{ fontSize: '2em', fontStyle: 'italic', fontWeight: 'bold', margin: '0 0 20px 0' }}><LabelMagico valor={getLabel('tituloAnaliseBase', 'Status (Rank Base)')} onChange={(v) => setLabel('tituloAnaliseBase', v)} /></h2>
                            {(minhaFicha.statusPool || 0) > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '15px' }}>
                                    <div style={{ background: 'rgba(0,255,150,0.15)', border: '1px solid #00ff96', borderRadius: '8px', padding: '6px 14px', fontWeight: 'bold', fontSize: '0.9em' }}>
                                        ⭐ Pontos de Status Disponíveis: {Math.floor(minhaFicha.statusPool)}
                                    </div>
                                    {Math.floor(minhaFicha.statusPool) >= 8 && (
                                        <button type="button" onClick={distribuirPoolIgualmente}
                                            style={{ background: 'rgba(0,255,150,0.1)', border: '1px solid #00ff96', borderRadius: '8px', padding: '6px 14px', fontWeight: 'bold', fontSize: '0.85em', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}
                                            title="Distribui o pool disponível igualmente entre os 8 atributos, pra uma build equilibrada">⚖️ Distribuir pool igualmente</button>
                                    )}
                                </div>
                            )}
                            <RadarDesenhado ficha={minhaFicha} isAtual={false} corTinta={localCorTinta} fator={fatorAtributosBase} />

                            <div style={{ width: '100%', maxWidth: '300px', marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <LinhaAtributoCru labelKey="lblFor" fallbackLabel="Força" attrKey="forca" isAtual={false} ficha={minhaFicha} getLabel={getLabel} setLabel={setLabel} salvar={salvar} fator={fatorAtributosBase} attrBaseFocado={attrBaseFocado} setAttrBaseFocado={setAttrBaseFocado} poolDisponivel={minhaFicha.statusPool || 0} onAlocarPool={alocarPontoStatus} poolGastoDisponivel={pontosAlocadosStatus('forca')} onDevolverPool={devolverPontoStatus} />
                                <LinhaAtributoCru labelKey="lblDes" fallbackLabel="Destreza" attrKey="destreza" isAtual={false} ficha={minhaFicha} getLabel={getLabel} setLabel={setLabel} salvar={salvar} fator={fatorAtributosBase} attrBaseFocado={attrBaseFocado} setAttrBaseFocado={setAttrBaseFocado} poolDisponivel={minhaFicha.statusPool || 0} onAlocarPool={alocarPontoStatus} poolGastoDisponivel={pontosAlocadosStatus('destreza')} onDevolverPool={devolverPontoStatus} />
                                <LinhaAtributoCru labelKey="lblInt" fallbackLabel="Inteligência" attrKey="inteligencia" isAtual={false} ficha={minhaFicha} getLabel={getLabel} setLabel={setLabel} salvar={salvar} fator={fatorAtributosBase} attrBaseFocado={attrBaseFocado} setAttrBaseFocado={setAttrBaseFocado} poolDisponivel={minhaFicha.statusPool || 0} onAlocarPool={alocarPontoStatus} poolGastoDisponivel={pontosAlocadosStatus('inteligencia')} onDevolverPool={devolverPontoStatus} />
                                <LinhaAtributoCru labelKey="lblSab" fallbackLabel="Sabedoria" attrKey="sabedoria" isAtual={false} ficha={minhaFicha} getLabel={getLabel} setLabel={setLabel} salvar={salvar} fator={fatorAtributosBase} attrBaseFocado={attrBaseFocado} setAttrBaseFocado={setAttrBaseFocado} poolDisponivel={minhaFicha.statusPool || 0} onAlocarPool={alocarPontoStatus} poolGastoDisponivel={pontosAlocadosStatus('sabedoria')} onDevolverPool={devolverPontoStatus} />
                                <LinhaAtributoCru labelKey="lblEsp" fallbackLabel="Energia Espiritual" attrKey="energiaEsp" isAtual={false} ficha={minhaFicha} getLabel={getLabel} setLabel={setLabel} salvar={salvar} fator={fatorAtributosBase} attrBaseFocado={attrBaseFocado} setAttrBaseFocado={setAttrBaseFocado} poolDisponivel={minhaFicha.statusPool || 0} onAlocarPool={alocarPontoStatus} poolGastoDisponivel={pontosAlocadosStatus('energiaEsp')} onDevolverPool={devolverPontoStatus} />
                                <LinhaAtributoCru labelKey="lblCar" fallbackLabel="Carisma" attrKey="carisma" isAtual={false} ficha={minhaFicha} getLabel={getLabel} setLabel={setLabel} salvar={salvar} fator={fatorAtributosBase} attrBaseFocado={attrBaseFocado} setAttrBaseFocado={setAttrBaseFocado} poolDisponivel={minhaFicha.statusPool || 0} onAlocarPool={alocarPontoStatus} poolGastoDisponivel={pontosAlocadosStatus('carisma')} onDevolverPool={devolverPontoStatus} />
                                <LinhaAtributoCru labelKey="lblSta" fallbackLabel="Stamina" attrKey="stamina" isAtual={false} ficha={minhaFicha} getLabel={getLabel} setLabel={setLabel} salvar={salvar} fator={fatorAtributosBase} attrBaseFocado={attrBaseFocado} setAttrBaseFocado={setAttrBaseFocado} poolDisponivel={minhaFicha.statusPool || 0} onAlocarPool={alocarPontoStatus} poolGastoDisponivel={pontosAlocadosStatus('stamina')} onDevolverPool={devolverPontoStatus} />
                                <LinhaAtributoCru labelKey="lblCon" fallbackLabel="Constituição" attrKey="constituicao" isAtual={false} ficha={minhaFicha} getLabel={getLabel} setLabel={setLabel} salvar={salvar} fator={fatorAtributosBase} attrBaseFocado={attrBaseFocado} setAttrBaseFocado={setAttrBaseFocado} poolDisponivel={minhaFicha.statusPool || 0} onAlocarPool={alocarPontoStatus} poolGastoDisponivel={pontosAlocadosStatus('constituicao')} onDevolverPool={devolverPontoStatus} />
                            </div>
                        </div>

                        <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(0,0,0,0.05)', padding: '20px', borderRadius: '15px', border: '2px solid currentColor' }}>
                            <h2 style={{ fontSize: '2em', fontStyle: 'italic', fontWeight: 'bold', margin: '0 0 20px 0' }}><LabelMagico valor={getLabel('tituloAnaliseAtual', 'Poder Atual (c/ Formas)')} onChange={(v) => setLabel('tituloAnaliseAtual', v)} /></h2>
                            <RadarDesenhado ficha={minhaFicha} isAtual={true} corTinta={localCorTinta} fator={fatorAtributosAtual} />
                            
                            <div style={{ width: '100%', maxWidth: '300px', marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <LinhaAtributoCru labelKey="lblFor" fallbackLabel="Força" attrKey="forca" isAtual={true} ficha={minhaFicha} getLabel={getLabel} setLabel={setLabel} salvar={salvar} fator={fatorAtributosAtual} attrBaseFocado={attrBaseFocado} setAttrBaseFocado={setAttrBaseFocado} />
                                <LinhaAtributoCru labelKey="lblDes" fallbackLabel="Destreza" attrKey="destreza" isAtual={true} ficha={minhaFicha} getLabel={getLabel} setLabel={setLabel} salvar={salvar} fator={fatorAtributosAtual} attrBaseFocado={attrBaseFocado} setAttrBaseFocado={setAttrBaseFocado} />
                                <LinhaAtributoCru labelKey="lblInt" fallbackLabel="Inteligência" attrKey="inteligencia" isAtual={true} ficha={minhaFicha} getLabel={getLabel} setLabel={setLabel} salvar={salvar} fator={fatorAtributosAtual} attrBaseFocado={attrBaseFocado} setAttrBaseFocado={setAttrBaseFocado} />
                                <LinhaAtributoCru labelKey="lblSab" fallbackLabel="Sabedoria" attrKey="sabedoria" isAtual={true} ficha={minhaFicha} getLabel={getLabel} setLabel={setLabel} salvar={salvar} fator={fatorAtributosAtual} attrBaseFocado={attrBaseFocado} setAttrBaseFocado={setAttrBaseFocado} />
                                <LinhaAtributoCru labelKey="lblEsp" fallbackLabel="Energia Espiritual" attrKey="energiaEsp" isAtual={true} ficha={minhaFicha} getLabel={getLabel} setLabel={setLabel} salvar={salvar} fator={fatorAtributosAtual} attrBaseFocado={attrBaseFocado} setAttrBaseFocado={setAttrBaseFocado} />
                                <LinhaAtributoCru labelKey="lblCar" fallbackLabel="Carisma" attrKey="carisma" isAtual={true} ficha={minhaFicha} getLabel={getLabel} setLabel={setLabel} salvar={salvar} fator={fatorAtributosAtual} attrBaseFocado={attrBaseFocado} setAttrBaseFocado={setAttrBaseFocado} />
                                <LinhaAtributoCru labelKey="lblSta" fallbackLabel="Stamina" attrKey="stamina" isAtual={true} ficha={minhaFicha} getLabel={getLabel} setLabel={setLabel} salvar={salvar} fator={fatorAtributosAtual} attrBaseFocado={attrBaseFocado} setAttrBaseFocado={setAttrBaseFocado} />
                                <LinhaAtributoCru labelKey="lblCon" fallbackLabel="Constituição" attrKey="constituicao" isAtual={true} ficha={minhaFicha} getLabel={getLabel} setLabel={setLabel} salvar={salvar} fator={fatorAtributosAtual} attrBaseFocado={attrBaseFocado} setAttrBaseFocado={setAttrBaseFocado} />
                            </div>
                        </div>

                        <div style={{ width: '100%', marginTop: '30px', background: 'rgba(0,0,0,0.03)', padding: '20px', borderRadius: '15px', border: '1px dashed currentColor' }}>
                            <h2 style={{ fontSize: '1.8em', fontStyle: 'italic', fontWeight: 'bold', margin: '0 0 20px 0', textAlign: 'center', color: 'inherit' }}>Mecânicas de Ascensão e Divisores</h2>

                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                                <div style={{ background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '10px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '15px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.1em' }}>Ascensão Base (Nível):</span>
                                    <CampoMagico valor={minhaFicha.ascensaoBase || 1} onChange={(v) => salvar('ascensaoBase', v)} type="number" isNumber={true} styleExtra={{ width: '60px', textAlign: 'center', color: '#fff', borderBottom: '1px dashed #fff', fontSize: '1.2em' }} />
                                    <span style={{ fontSize: '0.85em', opacity: 0.9, fontStyle: 'italic', borderLeft: '1px solid rgba(255,255,255,0.3)', paddingLeft: '12px' }}>
                                        Ascensão Geral Efetiva: <strong style={{ color: '#ffcc00' }}>{Math.floor(ascensaoGeralEfetiva)}</strong>
                                    </span>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '10px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '15px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.1em' }}>Mult. Força (Prestígio):</span>
                                    <CampoMagico valor={minhaFicha.multiplicadorForcaPrestigio ?? 1} onChange={(v) => salvar('multiplicadorForcaPrestigio', v)} type="number" isNumber={true} styleExtra={{ width: '60px', textAlign: 'center', color: '#fff', borderBottom: '1px dashed #fff', fontSize: '1.2em' }} />
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '10px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '15px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.1em' }}>Mult. Força (Ascensão):</span>
                                    <CampoMagico valor={minhaFicha.multiplicadorForcaAscensao ?? 1} onChange={(v) => salvar('multiplicadorForcaAscensao', v)} type="number" isNumber={true} styleExtra={{ width: '60px', textAlign: 'center', color: '#fff', borderBottom: '1px dashed #fff', fontSize: '1.2em' }} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
                                {['vida', 'mana', 'aura', 'chakra', 'corpo', 'status'].map(k => {
                                    const displayP = getPontosParaAscensao(minhaFicha, k);
                                    const campoEditavel = displayP;
                                    const divisor = minhaFicha.divisores?.[k] || 1;

                                    let mF = 1;
                                    if (fatorCrescimentoAtual > 1) { mF = getEfetivoMFormas(minhaFicha, k); if(isNaN(mF) || mF < 1) mF = 1; }
                                    const pAtualValor = Math.floor(displayP * mF);

                                    const rankInfo = aplicarMultiplicadorForca(
                                        pAtualValor, minhaFicha.ascensaoBase || 1,
                                        minhaFicha.multiplicadorForcaPrestigio ?? 1, minhaFicha.multiplicadorForcaAscensao ?? 1
                                    );

                                    return (
                                        <div key={k} style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.05)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 'bold', color: 'inherit', fontSize: '1.1em' }}>{k.toUpperCase()}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9em' }}>
                                                    <span style={{ fontStyle: 'italic', fontWeight: 'bold' }}>Divisor:</span>
                                                    <CampoMagico valor={divisor} onChange={v => handleTabelaChange(k, 'divisor', v)} type="number" isNumber={true} styleExtra={{ width: '50px', textAlign: 'center', border: '1px solid currentColor', borderRadius: '4px', background: 'rgba(255,255,255,0.5)' }} />
                                                </div>
                                            </div>
                                            <div style={{ width: '100%', background: 'rgba(0,0,0,0.85)', borderRadius: '6px', padding: '5px', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
                                                <CampoMagico
                                                    valor={campoEditavel}
                                                    onChange={v => handleTabelaChange(k, 'prestigio', v)}
                                                    type="number"
                                                    isNumber={true}
                                                    styleExtra={{ width: '100%', textAlign: 'center', color: '#fff', borderBottom: 'none', fontSize: '1.4em', fontWeight: 'bold' }}
                                                />
                                            </div>
                                            <div style={{ width: '100%', background: 'rgba(0,0,0,0.85)', borderRadius: '6px', padding: '5px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
                                                <span style={{ color: rankInfo.c || '#fff', fontWeight: 'bold', fontSize: '0.9em' }}>Rank {rankInfo.l || 'F'} [A{Math.floor(rankInfo.ascensaoFinal || 1)}]</span>
                                                <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.1em' }}>{Number(Math.floor(rankInfo.prestigioFinal || 0)).toLocaleString('pt-BR')}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}

                {paginaAtual === 3 && ( <DominiosPanel ficha={minhaFicha} updateFicha={updateFicha} /> )}
                {paginaAtual === 4 && ( <ClassificacaoPanel /> )}
                {paginaAtual === 5 && ( <RelicarioPanel /> )}
                {paginaAtual === 6 && ( <PactosPanel /> )}

            </div>

            <div style={{ position: 'absolute', bottom: '20px', left: '0', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', fontFamily: 'inherit' }}>
                <button onClick={() => mudarPagina(Math.max(1, paginaAtual - 1))} disabled={paginaAtual === 1} style={{ background: 'transparent', border: 'none', fontSize: '1.2em', fontWeight: 'bold', cursor: paginaAtual === 1 ? 'default' : 'pointer', opacity: paginaAtual === 1 ? 0.3 : 1, fontFamily: 'inherit', color: 'inherit' }}>⮜ Anterior</button>
                <span style={{ fontSize: '1.1em', fontWeight: 'bold', borderBottom: '2px solid currentColor', padding: '0 10px' }}>Página {paginaAtual} de 6</span>
                <button onClick={() => mudarPagina(Math.min(6, paginaAtual + 1))} disabled={paginaAtual === 6} style={{ background: 'transparent', border: 'none', fontSize: '1.2em', fontWeight: 'bold', cursor: paginaAtual === 6 ? 'default' : 'pointer', opacity: paginaAtual === 6 ? 0.3 : 1, fontFamily: 'inherit', color: 'inherit' }}>Próxima ⮞</button>
            </div>
        </div>
    );
}