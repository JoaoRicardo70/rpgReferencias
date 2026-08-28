import React, { useState, useMemo } from 'react';
import useStore from '../../stores/useStore';
import { getRawBase, getBuffs } from '../../core/attributes.js'; 
import { getPrestigioReal, getRank } from '../../core/prestige.js';
import { salvarFichaSilencioso } from '../../services/firebase-sync.js';

const safeFn = (fn, fallback) => (...args) => {
    if (typeof fn !== 'function') return fallback;
    try { 
        const res = fn(...args);
        return (res !== undefined && res !== null && !Number.isNaN(res)) ? res : fallback;
    } catch (e) { return fallback; }
};

const safeGetRawBase = safeFn(getRawBase, 0);
const safeGetPrestigioReal = safeFn(getPrestigioReal, 0);
const safeGetRank = safeFn(getRank, { l: 'F', c: '#ffffff', a: 1 });

const VITALS_KEYS = ['vida', 'mana', 'aura', 'chakra', 'corpo', 'status'];
const VITALS_LABELS = ['VIDA', 'MANA', 'AURA', 'CHAKRA', 'CORPO', 'STATUS'];
const STATS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

const MULTIPLICADORES = {
    vida: 1000000, mana: 10000000, aura: 10000000,
    chakra: 10000000, corpo: 10000000, status: 1000
};

// --- MOTOR NATIVO DAS FORMAS ---
function getEfetivoMFormas(ficha, k) {
    const anchor = k === 'status' ? 'forca' : k;
    let s = ficha[anchor] || {};
    
    // O SEGREDO ESTÁ AQUI: O 'true' diz à engine: "Ignore as passivas!"
    let b = getBuffs(ficha, anchor, true);

    let v = parseFloat(s.mFormas) || 1.0;
    if (!b._hasBuff || !b._hasBuff.mformas) return v;
    return (v === 1.0 ? 0 : v) + b.mformas;
}

function calcularPrestAtual(ficha, attrKey, baseP) {
    const mFormas = getEfetivoMFormas(ficha, attrKey);
    const multForma = mFormas >= 10 ? (mFormas / 10) : 1;
    return Math.floor(baseP * multForma);
}

// 🔥 Multiplicador de Força — separado em Prestígio e Ascensão. O Prestígio Base é
// escalado pelo seu próprio multiplicador e o excesso acima de 100 vira Ascensão extra
// (overflow), somada à Ascensão Base já escalada pelo multiplicador dela. getRank() é
// reusado só para o rótulo/cor do badge (Rank), com o mesmo tratamento de limites
// (EX exato, valores negativos) do resto do sistema de Prestígio/Ascensão.
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

const getBasePFor = (ficha, k) => {
    if (k === 'status') {
        let m = 0;
        STATS.forEach(s => m += safeGetRawBase(ficha, s));
        // 🔥 Precisa multiplicar pelo divisor de status (mesma fórmula de getBasePFor em
        // Marcados.jsx) — sem isso, a Ascensão de Status calculada aqui diverge da calculada na
        // aba "Ficha Def" sempre que o divisor de status não for 1, o que agora também afeta
        // quanto pool cada ponto de Prestígio concede (ver calcularAscensaoAtualStatus abaixo).
        const div = parseFloat(ficha?.divisores?.status) || 1;
        return Math.floor(((m / 8) / 1000) * div);
    }
    return safeGetPrestigioReal(k, safeGetRawBase(ficha, k));
};

// 🔥 Ascensão ATUAL de Status — mesmo cálculo do badge "Rank" mostrado na coluna PRESTÍGIO
// ATUAL (usa a média ao vivo dos 8 atributos, não o pool). Usado para escalar quantos pontos de
// pool cada ponto de Prestígio concede: em Ascensão 1, 1 ponto = 8 pool (1 por atributo); em
// Ascensão 2, 1 ponto = 16 pool; e assim por diante.
function calcularAscensaoAtualStatus(ficha) {
    const baseP = getBasePFor(ficha, 'status');
    const pAtual = calcularPrestAtual(ficha, 'status', baseP);
    const rankInfo = aplicarMultiplicadorForca(pAtual, ficha.ascensaoBase || 1, ficha.multiplicadorForcaPrestigio ?? 1, ficha.multiplicadorForcaAscensao ?? 1);
    return Math.max(1, Math.floor(rankInfo.ascensaoFinal || 1));
}

export default function TabelaPrestigio({ className }) {
    const ficha = useStore((s) => s.minhaFicha);
    const updateFicha = useStore((s) => s.updateFicha);
    const [statusBotao, setStatusBotao] = useState('idle');

    // CÁLCULO DA MÉDIA DA ASCENSÃO EFETIVA (já com o transbordo do Multiplicador de Força)
    const mediaAscensaoEfetiva = useMemo(() => {
        if (!ficha) return 1;
        const ascensaoBase = ficha.ascensaoBase || 1;
        const multP = ficha.multiplicadorForcaPrestigio ?? 1;
        const multA = ficha.multiplicadorForcaAscensao ?? 1;
        let sumAscensao = 0;
        VITALS_KEYS.forEach(k => {
            const baseP = getBasePFor(ficha, k);
            const pAtual = calcularPrestAtual(ficha, k, baseP);
            const rankFinal = aplicarMultiplicadorForca(pAtual, ascensaoBase, multP, multA);
            sumAscensao += (rankFinal.ascensaoFinal || 1);
        });
        return Math.floor(sumAscensao / VITALS_KEYS.length);
    }, [ficha]);

    const handleSalvarPrestigio = async () => {
        setStatusBotao('saving');
        try {
            await salvarFichaSilencioso();
            setStatusBotao('saved');
            setTimeout(() => setStatusBotao('idle'), 2500);
        } catch (error) {
            setStatusBotao('idle');
        }
    };

    if (!ficha) return null;

    return (
        <div className={['tabela-prestigio-module', className].filter(Boolean).join(' ')} style={{ marginTop: '20px' }}>
            <h3 className="section-title-mint-spaced" style={{ color: '#fff', fontSize: '1.2em', marginTop: 0 }}>
                &gt; SISTEMA DE PRESTÍGIO E ASCENSÃO (CULTIVAÇÃO)
            </h3>
            
            <div className="grid-2col" style={{ marginBottom: '15px' }}>
                {/* PRESTÍGIO BASE */}
                <div className="tabela-prestigio">
                    <h4 className="prestige-title-base">PRESTÍGIO BASE</h4>
                    {(ficha.statusPool || 0) > 0 && (
                        <div style={{ background: 'rgba(0,255,150,0.15)', border: '1px solid #00ff96', borderRadius: '8px', padding: '6px 12px', marginBottom: '10px', fontWeight: 'bold', fontSize: '0.85em', color: '#fff' }}>
                            ⭐ {Math.floor(ficha.statusPool)} pontos de Status aguardando distribuição na aba "Ficha Def" (Status Rank Base)
                        </div>
                    )}
                    <div className="prestige-ascension-box">
                        <label className="text-white-md" style={{ display: 'block', marginBottom: '5px' }}>Ascensão Base (Nível):</label>
                        <input
                            type="number" className="prestige-input-base"
                            value={ficha.ascensaoBase || 1}
                            onChange={(e) => { updateFicha(f => { f.ascensaoBase = Number(e.target.value) }); }}
                        />
                    </div>
                    <div className="prestige-ascension-box" style={{ marginTop: '15px' }}>
                        <label className="text-white-md" style={{ display: 'block', marginBottom: '5px' }}>Mult. Força (Prestígio):</label>
                        <input
                            type="number" step="0.1" className="prestige-input-base"
                            value={ficha.multiplicadorForcaPrestigio ?? 1}
                            onChange={(e) => { updateFicha(f => { f.multiplicadorForcaPrestigio = Number(e.target.value) || 1 }); }}
                        />
                    </div>
                    <div className="prestige-ascension-box" style={{ marginTop: '15px' }}>
                        <label className="text-white-md" style={{ display: 'block', marginBottom: '5px' }}>Mult. Força (Ascensão):</label>
                        <input
                            type="number" step="0.1" className="prestige-input-base"
                            value={ficha.multiplicadorForcaAscensao ?? 1}
                            onChange={(e) => { updateFicha(f => { f.multiplicadorForcaAscensao = Number(e.target.value) || 1 }); }}
                        />
                    </div>
                    <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {VITALS_KEYS.map((attrKey, i) => {
                            const calcBaseP = getBasePFor(ficha, attrKey);
                            // 🔥 O campo editável de "status" mostra ficha.statusPrestigioAplicado — o último
                            // valor de Prestígio realmente aplicado ao pool — não a média ao vivo dos 8
                            // atributos (`calcBaseP`, que ainda alimenta o Rank/Badge normalmente e muda
                            // sozinha conforme o pool é distribuído, o que faria este campo "reconceder" pontos
                            // toda vez que o jogador reduzisse e aumentasse o valor de novo).
                            const campoEditavel = attrKey === 'status'
                                ? (ficha.statusPrestigioAplicado ?? 0)
                                : calcBaseP;
                            const divisor = ficha.divisores?.[attrKey] ?? 1;

                            return (
                                <div key={attrKey}>
                                    <div className="label-divisor" style={{ marginBottom: '5px' }}>
                                        <span style={{ color: '#00ffcc', fontWeight: 'bold' }}>{VITALS_LABELS[i]}</span>
                                        <span>Divisor: <input type="number" className="divisor-mini-input" value={divisor}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value) || 1;
                                                updateFicha(f => {
                                                    if (!f.divisores) f.divisores = { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 };
                                                    f.divisores[attrKey] = val;
                                                });
                                            }}
                                        /></span>
                                    </div>
                                    <input type="number" className="prestige-input-base" value={campoEditavel}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            // 🔥 Status vira um POOL medido em PONTOS. Edita diretamente
                                            // ficha.statusPrestigioAplicado (ver campoEditavel acima), e só a
                                            // DIFERENÇA em relação ao último valor aplicado credita pool — multiplicada
                                            // pela Ascensão ATUAL de Status: 8 pool por ponto na Ascensão 1, 16 na
                                            // Ascensão 2 etc. Mudar de Ascensão só afeta pool concedido DAQUI PRA
                                            // FRENTE, nunca recalcula o que já existe. Calculado fora do updateFicha
                                            // porque o aviso ao jogador (efeito colateral) não pertence ao callback do
                                            // Immer.
                                            let avisoReducaoIncompleta = null;
                                            if (attrKey === 'status') {
                                                const ascensaoAtual = calcularAscensaoAtualStatus(ficha);
                                                const aplicadoAntes = parseFloat(ficha.statusPrestigioAplicado) || 0;
                                                const deltaPrestigio = val - aplicadoAntes;
                                                const poolCreditoAlvo = deltaPrestigio * STATS.length * ascensaoAtual;
                                                const poolAntes = parseFloat(ficha.statusPool) || 0;
                                                if (poolCreditoAlvo < 0 && (poolAntes + poolCreditoAlvo) < 0) {
                                                    avisoReducaoIncompleta = `Só foi possível remover ${poolAntes} dos ${Math.abs(poolCreditoAlvo)} pontos de pool pedidos: o restante já foi distribuído entre os atributos e precisa ser reduzido manualmente em cada um na aba "Ficha Def" (botão "− Pool").`;
                                                }
                                            }
                                            updateFicha(f => {
                                                if (attrKey === 'status') {
                                                    const ascensaoAtual = calcularAscensaoAtualStatus(f);
                                                    const aplicadoAntes = parseFloat(f.statusPrestigioAplicado) || 0;
                                                    const deltaPrestigio = val - aplicadoAntes;
                                                    const poolCreditoAlvo = deltaPrestigio * STATS.length * ascensaoAtual;
                                                    const poolAntes = parseFloat(f.statusPool) || 0;
                                                    const poolDepois = Math.max(0, poolAntes + poolCreditoAlvo);
                                                    const creditoRealAplicado = poolDepois - poolAntes;
                                                    f.statusPool = poolDepois;
                                                    f.statusPrestigioAplicado = aplicadoAntes + (creditoRealAplicado / (STATS.length * ascensaoAtual));
                                                } else {
                                                    if(f[attrKey]) f[attrKey].base = val * MULTIPLICADORES[attrKey];
                                                }
                                            });
                                            if (avisoReducaoIncompleta) alert(avisoReducaoIncompleta);
                                        }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* PRESTÍGIO ATUAL */}
                <div className="tabela-prestigio atual">
                    <h4 className="prestige-title-atual">PRESTÍGIO ATUAL</h4>
                    <div className="prestige-ascension-box">
                        <label className="text-white-md" style={{ display: 'block', marginBottom: '5px' }}>Ascensão Efetiva (Média):</label>
                        <div className="prestige-display-atual">{mediaAscensaoEfetiva}</div>
                    </div>
                    <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {VITALS_KEYS.map((attrKey, i) => {
                            const calcBaseP = getBasePFor(ficha, attrKey);
                            const pAtualValor = calcularPrestAtual(ficha, attrKey, calcBaseP);

                            // 🔥 Multiplicador de Força: escala Prestígio/Ascensão separadamente e usa
                            // getRank() para o rótulo/cor — Rank, cor e Ascensão exibidos vêm todos do
                            // mesmo cálculo final, sem divergência entre badge e número
                            const rankInfo = aplicarMultiplicadorForca(
                                pAtualValor, ficha.ascensaoBase || 1,
                                ficha.multiplicadorForcaPrestigio ?? 1, ficha.multiplicadorForcaAscensao ?? 1
                            );

                            return (
                                <div key={attrKey}>
                                    <div className="label-divisor" style={{ marginBottom: '5px' }}>
                                        <span style={{ color: '#00ffcc', fontWeight: 'bold' }}>{VITALS_LABELS[i]}</span>
                                        <span style={{ color: rankInfo.c || '#fff', fontWeight: 'bold' }}>Rank {rankInfo.l || 'F'} [A{Math.floor(rankInfo.ascensaoFinal || 1)}]</span>
                                    </div>
                                    <div className="prestige-display-atual">
                                        {Math.floor(rankInfo.prestigioFinal || 0).toLocaleString('pt-BR')}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <button className={`btn-neon ${statusBotao === 'saved' ? 'btn-green' : 'btn-gold'}`} onClick={handleSalvarPrestigio} disabled={statusBotao === 'saving'} style={{ width: '100%', marginBottom: '30px', height: '50px', transition: 'all 0.3s ease' }}>
                {statusBotao === 'idle' && '💾 SALVAR PRESTÍGIO NO SERVIDOR'}
                {statusBotao === 'saving' && '⏳ ENVIANDO PARA A FORJA (FIREBASE)...'}
                {statusBotao === 'saved' && '✅ PRESTÍGIOS SALVOS COM SUCESSO!'}
            </button>
        </div>
    );
}