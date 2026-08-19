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
        return Math.floor((m / 8) / 1000);
    }
    return safeGetPrestigioReal(k, safeGetRawBase(ficha, k));
};

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
                                    <input type="number" className="prestige-input-base" value={calcBaseP} 
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            updateFicha(f => {
                                                if (attrKey === 'status') {
                                                    const stBase = val * 1000;
                                                    STATS.forEach(s => { if(f[s]) f[s].base = stBase; });
                                                } else {
                                                    if(f[attrKey]) f[attrKey].base = val * MULTIPLICADORES[attrKey];
                                                }
                                            });
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