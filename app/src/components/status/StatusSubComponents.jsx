import React, { useMemo, useState } from 'react';
import useStore from '../../stores/useStore';
import {
    useStatusForm,
    VITALS_RADAR, VITALS_LABELS, ATRIBUTOS_PRINCIPAIS, COLOR_CONFIGS,
    CX, CY, R, ANGLES,
    hexPoints, radarPoint, hexToRgba,
    getBasePFor, calcularPrestAtual,
    safeGetMaximo, safeGetRawBase, safeGetRank,
} from './StatusFormContext';
import { calcularBarrasVida } from '../../core/vitals';
import BarrasVida from '../shared/BarrasVida';

const FALLBACK = <div style={{ color: '#888', padding: 10 }}>Status provider nao encontrado</div>;

/* ── Radar Chart ── */

export function StatusRadarChart({ isAtual }) {
    const ctx = useStatusForm();
    if (!ctx) return FALLBACK;
    const { ficha, tempCores } = ctx;
    if (!ficha) return null;

    const LIMIT = 100;
    const chartValues = VITALS_RADAR.map((k) => {
        const baseP = getBasePFor(ficha, k);
        return isAtual ? calcularPrestAtual(ficha, k, baseP) : baseP;
    });

    const dataPoints = chartValues.map((v, i) => {
        let val = v || 0;
        if (val >= LIMIT) { val = val % LIMIT; if (val === 0 && v > 0) val = LIMIT; }
        return radarPoint(CX, CY, R, i, Math.min(val / LIMIT, 1));
    });

    const dataPoly = dataPoints.map((p) => `${p[0] || 0},${p[1] || 0}`).join(' ');

    const rankInfos = VITALS_RADAR.map((k) => {
        const baseP = getBasePFor(ficha, k);
        const pAtualValor = isAtual ? calcularPrestAtual(ficha, k, baseP) : baseP;
        return safeGetRank(pAtualValor, ficha?.ascensaoBase || 1);
    });

    const labelR = R + 18;
    const labelPos = ANGLES.map((a) => [CX + labelR * Math.cos(a), CY + labelR * Math.sin(a)]);

    const baseColor = tempCores?.radarBase || '#00ffff';
    const atualColor = tempCores?.radarAtual || '#ffcc00';
    const polyColor = isAtual ? hexToRgba(atualColor, 0.2) : hexToRgba(baseColor, 0.2);
    const strokeColor = isAtual ? atualColor : baseColor;
    const gridStroke = isAtual ? hexToRgba(atualColor, 0.1) : hexToRgba(baseColor, 0.1);

    return (
        <svg viewBox="0 0 200 200" className={`radar-svg ${isAtual ? 'atual' : ''}`} style={{ width: '100%', height: 'auto', maxHeight: '400px', overflow: 'visible' }}>
            {[0.25, 0.5, 0.75, 1.0].map((s, i) => (
                <polygon key={i} points={hexPoints(CX, CY, R * s)} fill="none" stroke={gridStroke} strokeWidth="1.5" />
            ))}
            {ANGLES.map((a, i) => (
                <line key={i} x1={CX} y1={CY} x2={CX + R * Math.cos(a)} y2={CY + R * Math.sin(a)} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4" />
            ))}
            <polygon points={dataPoly} fill={polyColor} stroke={strokeColor} strokeWidth="2.5" style={{ transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }} />
            {dataPoints.map(([x, y], i) => (
                <circle key={i} cx={x || 0} cy={y || 0} r="4" fill={strokeColor} style={{ transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }} />
            ))}
            {VITALS_LABELS.map((lbl, i) => {
                const [lx, ly] = labelPos[i];
                const rk = rankInfos[i];
                return (
                    <text key={i} x={lx || 0} y={ly || 0} textAnchor="middle" dominantBaseline="central" fill={rk.c || '#fff'} fontSize="11" fontWeight="bold" style={{ textShadow: '0 0 5px #000' }}>
                        [{rk.l || 'F'}] A{rk.a || 1} {lbl}
                    </text>
                );
            })}
        </svg>
    );
}

/* ── Lista de Atributos ── */

export function StatusAtributosLista({ isAtual }) {
    const ctx = useStatusForm();
    if (!ctx) return FALLBACK;
    const { ficha } = ctx;
    if (!ficha) return null;

    const valores = useMemo(() => ATRIBUTOS_PRINCIPAIS.map(({ key, label }) => {
        let valor;
        if (isAtual) {
            valor = safeGetMaximo(ficha, key);
        } else {
            const rawBase = safeGetRawBase(ficha, key);
            const mBase = parseFloat(ficha[key]?.mBase) || 1.0;
            valor = Math.floor(rawBase * mBase);
        }
        return { key, label, valor };
    }), [ficha, isAtual]);

    return (
        <div className="atributo-lista" style={{ marginTop: '20px' }}>
            {valores.map(({ key, label, valor }) => (
                <div key={key} className="atributo-row" style={{ padding: '6px 0' }}>
                    <span style={{ fontSize: '1.05em' }}>{label}</span>
                    <span className={isAtual ? 'atributo-valor-atual' : 'atributo-valor-base'} style={{ fontSize: '1.1em', fontWeight: 'bold' }}>{valor.toLocaleString('pt-BR')}</span>
                </div>
            ))}
        </div>
    );
}

/* ── Barra de Vital Individual ── */

export function StatusVitalBar({ vitalKey, label, color, borderC, isSpecial, gridStyle }) {
    const ctx = useStatusForm();
    if (!ctx) return FALLBACK;
    const { ficha, getVitalMax, getVitalMaxEstavel } = ctx;
    if (!ficha) return null;

    const rawMx = getVitalMax(vitalKey, ficha);
    const rawMxEstavel = getVitalMaxEstavel(vitalKey, ficha);

    // 🩸 MÚLTIPLAS BARRAS DE VIDA (pedido do usuário): a cada ponto de Vitalidade (p) o personagem
    // ganha mais uma barra CHEIA de Vida, do mesmo tamanho (mxDisplay) que as anteriores — só Vida
    // faz isso. "atual" continua sendo um único número na ficha (o TOTAL somando todas as
    // barras); cada barra abaixo é só DERIVADA dele por calcularBarrasVida (core/vitals.js, ÚNICA
    // fonte de verdade dessa conta) — a da frente (índice 0) esvazia primeiro, o excesso
    // transborda pra próxima.
    const { p, mxDisplay, numBarras, barras } = calcularBarrasVida(rawMx, vitalKey, ficha[vitalKey]?.atual, rawMxEstavel);

    const regen = parseFloat(ficha[vitalKey]?.regeneracao) || 0;
    const extra = regen > 0 ? `(+${regen}/turno)` : '';

    // 💔 BREAK BARS: 2+ barras (ver core/vitals.js > calcularBarrasVida/montarBarrasVida) usam o visual novo em
    // pílula com losangos e "quebra" animada ao esvaziar (pedido do usuário) — componente
    // compartilhado (components/shared/BarrasVida.jsx), mesmo usado em Ficha Def/Marcados.jsx.
    if (numBarras > 1) {
        return (
            <div className="vital-container" style={gridStyle}>
                <div className="vital-label" style={{ color, textShadow: `0 0 8px ${color}80`, letterSpacing: '1px', fontWeight: 'bold', fontSize: '0.85em', textTransform: 'uppercase' }}>
                    {label} {extra && <span style={{ fontSize: '0.9em', color: '#aaa', textShadow: 'none' }}>{extra}</span>}
                </div>
                <BarrasVida barras={barras} cor={color} corTexto="#fff" altura={40} />
            </div>
        );
    }

    const atualBarra = barras[0].atual;
    const maxBarra = barras[0].max;
    const percent = maxBarra > 0 ? Math.min((atualBarra / maxBarra) * 100, 100) : 0;
    const vitalitySymbol = (p > 0 && (vitalKey === 'vida' || vitalKey === 'pv' || vitalKey === 'pm')) ? (
        <div style={{
            position: 'absolute', left: '8px', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '32px', height: '32px', background: 'rgba(20, 0, 0, 0.9)',
            border: `3px solid ${borderC || color}`, boxShadow: `0 0 10px ${borderC || color}, inset 0 0 5px ${borderC || color}80`,
            borderRadius: '4px', color: '#fff', fontWeight: 'bold', fontSize: '18px',
            fontFamily: 'arial, sans-serif', textShadow: `0 0 5px ${borderC || color}`
        }}>
            {p}
        </div>
    ) : null;

    return (
        <div className="vital-container" style={gridStyle}>
            <div className="vital-label" style={{ color, textShadow: `0 0 8px ${color}80`, letterSpacing: '1px', fontWeight: 'bold', fontSize: '0.85em', textTransform: 'uppercase' }}>
                {label} {extra && <span style={{ fontSize: '0.9em', color: '#aaa', textShadow: 'none' }}>{extra}</span>}
            </div>
            <div className="bar-bg" style={{ position: 'relative', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: isSpecial ? `1px solid ${color}40` : '' }}>
                <div className="bar-fill" style={{ width: `${percent}%`, backgroundColor: color, position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 'inherit', transition: 'width 0.3s' }} />
                {vitalitySymbol}
                <div className="bar-text" style={{ position: 'relative', zIndex: 2, width: '100%', textAlign: 'center', textShadow: '1px 1px 3px #000, -1px -1px 3px #000' }}>
                    <span style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#fff' }}>
                        {Math.floor(atualBarra).toLocaleString('pt-BR')} / {maxBarra.toLocaleString('pt-BR')}
                    </span>
                </div>
            </div>
        </div>
    );
}

/* ── Grid de Barras Principais ── */

export function StatusVitalsGrid() {
    const ctx = useStatusForm();
    if (!ctx) return FALLBACK;
    const { vitalsBars } = ctx;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
            {vitalsBars.map((item, i) => (
                <StatusVitalBar
                    key={item.key}
                    vitalKey={item.key}
                    label={item.label}
                    color={item.color}
                    borderC={item.borderC}
                    isSpecial={false}
                    gridStyle={i === 0 ? { gridColumn: '1 / -1', margin: 0 } : { margin: 0 }}
                />
            ))}
        </div>
    );
}

/* ── Grid de Energias Primordiais (PV/PM) ── */

export function StatusEnergiasPrimordiais() {
    const ctx = useStatusForm();
    if (!ctx) return FALLBACK;
    const { vitaisEspeciais } = ctx;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
            {vitaisEspeciais.map((item) => (
                <StatusVitalBar
                    key={item.key}
                    vitalKey={item.key}
                    label={item.label}
                    color={item.color}
                    borderC={item.borderC}
                    isSpecial={true}
                    gridStyle={{ margin: 0 }}
                />
            ))}
        </div>
    );
}

/* ── Multiplicadores PV/PM ── */

export function StatusMultiplicadores() {
    const ctx = useStatusForm();
    if (!ctx) return FALLBACK;
    const { ficha, updateFicha } = ctx;
    if (!ficha) return null;

    return (
        <div style={{ display: 'flex', gap: '15px', marginBottom: '30px' }}>
            <div className="input-group" style={{ flex: 1, background: 'rgba(0, 255, 136, 0.05)', padding: '10px', borderRadius: '8px', border: '1px solid #00ff88', margin: 0 }}>
                <label style={{ color: '#00ff88', fontSize: '0.8em', marginBottom: '5px', display: 'block' }}>MULT. DE VIDA (PV)</label>
                <input type="number" step="0.1" value={ficha.multiplicadorVida || 1} onChange={(e) => { updateFicha(f => f.multiplicadorVida = parseFloat(e.target.value) || 1); }} style={{ borderColor: '#00ff88', color: '#fff', width: '100%' }} />
            </div>
            <div className="input-group" style={{ flex: 1, background: 'rgba(255, 0, 255, 0.05)', padding: '10px', borderRadius: '8px', border: '1px solid #ff00ff', margin: 0 }}>
                <label style={{ color: '#ff00ff', fontSize: '0.8em', marginBottom: '5px', display: 'block' }}>MULT. DE MORTE (PM)</label>
                <input type="number" step="0.1" value={ficha.multiplicadorMorte || 1} onChange={(e) => { updateFicha(f => f.multiplicadorMorte = parseFloat(e.target.value) || 1); }} style={{ borderColor: '#ff00ff', color: '#fff', width: '100%' }} />
            </div>
        </div>
    );
}

/* ── Paleta de Cores ── */

export function StatusPaletaCores() {
    const ctx = useStatusForm();
    if (!ctx) return FALLBACK;
    const { showCores, setShowCores, tempCores, handleColorChange, salvarCores, resetarCores, salvandoCores } = ctx;

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 className="section-title-mint-spaced" style={{ margin: 0, color: '#fff', fontSize: '1.2em' }}>&gt; STATUS PRINCIPAIS</h3>
                <button
                    className="btn-neon btn-small"
                    onClick={() => setShowCores(!showCores)}
                    style={{ margin: 0, padding: '6px 15px', fontSize: '0.8em', borderColor: showCores ? '#ff003c' : '#ffcc00', color: showCores ? '#ff003c' : '#ffcc00' }}
                >
                    {showCores ? '❌ FECHAR PALETA' : '🎨 PERSONALIZAR CORES'}
                </button>
            </div>

            {showCores && (
                <div className="fade-in" style={{ marginBottom: '20px', background: 'rgba(0,0,0,0.6)', padding: '20px', borderRadius: '8px', border: '1px dashed #ffcc00', boxShadow: 'inset 0 0 20px rgba(255,204,0,0.1)' }}>
                    <h4 style={{ color: '#ffcc00', margin: '0 0 15px 0', letterSpacing: '1px' }}>🎨 Paleta da Alma</h4>
                    <p style={{ color: '#aaa', fontSize: '0.85em', marginTop: '-10px', marginBottom: '20px' }}>Selecione as cores e grave na Forja quando estiver satisfeito!</p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '15px' }}>
                        {COLOR_CONFIGS.map(c => (
                            <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.05)', padding: '5px 10px', borderRadius: '5px' }}>
                                <input
                                    type="color"
                                    value={tempCores[c.key] || c.default}
                                    onChange={e => handleColorChange(c.key, e.target.value)}
                                    style={{ width: '35px', height: '35px', padding: 0, border: 'none', borderRadius: '5px', cursor: 'pointer', background: 'transparent' }}
                                />
                                <label style={{ color: '#fff', fontSize: '0.85em', fontWeight: 'bold' }}>{c.label}</label>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                        <button className="btn-neon btn-red btn-small" onClick={resetarCores} style={{ margin: 0 }}>🔄 Resetar Cores</button>
                        <button
                            className="btn-neon btn-gold btn-small"
                            onClick={salvarCores}
                            style={{
                                margin: 0,
                                backgroundColor: salvandoCores ? 'rgba(0, 255, 100, 0.2)' : undefined,
                                borderColor: salvandoCores ? '#00ffcc' : undefined,
                                color: salvandoCores ? '#fff' : undefined
                            }}
                        >
                            {salvandoCores ? '✅ PALETA SALVA!' : '💾 SALVAR PALETA'}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

/* ── Economia de Acoes ── */

export function StatusEconomiaAcoes() {
    const ctx = useStatusForm();
    if (!ctx) return FALLBACK;
    const { ficha, changeActionMax, toggleActionDot, resetarTurno } = ctx;
    if (!ficha) return null;

    const renderDots = (tipo, color, label) => {
        const data = ficha?.acoes?.[tipo] || { max: 1, atual: 1 };
        const dots = [];
        for (let i = 0; i < data.max; i++) {
            const isAvailable = i < data.atual;
            dots.push(
                <div
                    key={i}
                    onClick={() => toggleActionDot(tipo, isAvailable)}
                    title={isAvailable ? 'Clique para gastar esta Ação' : 'Clique para recuperar esta Ação'}
                    style={{
                        width: '20px', height: '20px', borderRadius: '50%',
                        border: `2px solid ${color}`,
                        backgroundColor: isAvailable ? color : 'transparent',
                        cursor: 'pointer',
                        boxShadow: isAvailable ? `0 0 10px ${color}` : 'none',
                        transition: 'all 0.2s ease-in-out'
                    }}
                />
            );
        }
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <span style={{ color, fontSize: '0.85em', fontWeight: 'bold', textShadow: `0 0 5px ${color}` }}>{label}</span>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(0,0,0,0.4)', padding: '5px 12px', borderRadius: '20px', border: `1px solid ${color}44` }}>
                    <button onClick={() => changeActionMax(tipo, -1)} style={{ background: 'transparent', color: '#888', border: 'none', cursor: 'pointer', fontSize: '1.2em', padding: '0 5px' }} title="Reduzir Ações Máximas">-</button>
                    <div style={{ display: 'flex', gap: '5px' }}>{dots}</div>
                    <button onClick={() => changeActionMax(tipo, 1)} style={{ background: 'transparent', color: '#aaa', border: 'none', cursor: 'pointer', fontSize: '1.2em', padding: '0 5px' }} title="Aumentar Ações Máximas">+</button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ background: 'rgba(10, 10, 20, 0.6)', border: '1px solid #333', borderRadius: '8px', padding: '15px', marginBottom: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                {renderDots('padrao', '#0ff', 'AÇÃO PADRÃO')}
                {renderDots('bonus', '#ffcc00', 'AÇÃO BÔNUS')}
                {renderDots('reacao', '#ff00ff', 'REAÇÕES')}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
                <button className="btn-neon btn-blue" onClick={resetarTurno} style={{ padding: '8px 20px', letterSpacing: '1px' }}>
                    🔄 INICIAR NOVO TURNO (RESETAR AÇÕES)
                </button>
            </div>
        </div>
    );
}

/* ── Controle Rapido (Dano/Cura) ── */

export function StatusControleRapido() {
    const ctx = useStatusForm();
    if (!ctx) return FALLBACK;
    const { targetBar, setTargetBar, inputDano, setInputDano, inputLetalidade, setInputLetalidade, alterarVital, curarTudo, aplicarRegeneracaoTurno } = ctx;

    return (
        <>
            <div className="form-row-dark" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto auto', gap: '10px', alignItems: 'end', background: 'transparent', padding: 0 }}>
                <div className="input-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.8em', color: '#aaa' }}>ALVO</label>
                    <select value={targetBar} onChange={e => setTargetBar(e.target.value)} style={{ padding: '9px', background: '#111', color: '#00ffcc', border: '1px solid #00ffcc', borderRadius: '5px', fontWeight: 'bold' }}>
                        <option value="vida">Vida (HP)</option>
                        <option value="pv">Pontos Vitais (PV)</option>
                        <option value="pm">Pontos Mortais (PM)</option>
                        <option value="mana">Mana</option>
                        <option value="aura">Aura</option>
                        <option value="chakra">Chakra</option>
                        <option value="corpo">Corpo</option>
                    </select>
                </div>
                <div className="input-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.8em', color: '#aaa' }}>VALOR</label>
                    <input type="number" placeholder="Ex: 24500" value={inputDano} onChange={(e) => setInputDano(e.target.value)} />
                </div>
                <div className="input-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.8em', color: '#aaa' }}>LETALIDADE</label>
                    <input type="number" value={inputLetalidade} onChange={(e) => setInputLetalidade(e.target.value)} />
                </div>
                <button className="btn-neon btn-red btn-small" onClick={() => alterarVital('dano')} style={{ height: '44px', margin: 0, padding: '0 15px' }}>
                    🔥 DANO
                </button>
                <button className="btn-neon btn-green btn-small" onClick={() => alterarVital('curar')} style={{ height: '44px', margin: 0, padding: '0 15px' }}>
                    💊 CURAR
                </button>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginTop: '15px', marginBottom: '30px' }}>
                <button className="btn-neon btn-green btn-small" onClick={aplicarRegeneracaoTurno} style={{ flex: 1, margin: 0 }}>
                    ✨ APLICAR REGENERAÇÃO
                </button>
                <button className="btn-neon btn-small" onClick={curarTudo} style={{ flex: 1, margin: 0, borderColor: '#00ffff', color: '#00ffff' }}>
                    💚 RESTABELECER TUDO (100%)
                </button>
            </div>
        </>
    );
}

/* ── Analise de Poder (Radares lado a lado) ── */

export function StatusAnalisePoder() {
    const ctx = useStatusForm();
    if (!ctx) return FALLBACK;

    return (
        <div className="analise-grid" style={{ marginTop: '15px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="radar-container" style={{ background: 'rgba(25, 25, 40, 0.6)', padding: '30px 20px', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <h4 style={{ color: '#fff', textAlign: 'center', marginBottom: '25px', letterSpacing: '2px', fontSize: '0.95em' }}>STATUS (RANK BASE)<br /><span style={{ fontSize: '0.85em', color: '#0ff' }}>[A]</span></h4>
                <StatusRadarChart isAtual={false} />
                <StatusAtributosLista isAtual={false} />
            </div>
            <div className="radar-container atual" style={{ background: 'rgba(30, 25, 10, 0.6)', padding: '30px 20px', borderRadius: '10px', borderColor: 'rgba(255, 204, 0, 0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <h4 style={{ color: '#ffcc00', textAlign: 'center', marginBottom: '25px', letterSpacing: '2px', fontSize: '0.95em' }}>PODER ATUAL (C/ FORMAS)<br /><span style={{ fontSize: '0.85em', color: '#0f0' }}>[A]</span></h4>
                <StatusRadarChart isAtual={true} />
                <StatusAtributosLista isAtual={true} />
            </div>
        </div>
    );
}

// ============================================================================
// 🔥 NOVO: COMPONENTE DE IMPORTAÇÃO (COPIAR DO GOOGLE DOCS) 🔥
// ============================================================================
export function StatusImportador() {
    const [texto, setTexto] = useState('');
    const [aberto, setAberto] = useState(false);
    const importarDaAbaStatus = useStore(s => s.importarDaAbaStatus);

    const handleImportar = () => {
        if (!texto.trim()) return alert("Cole o texto da aba de Status do Google Docs aqui!");
        importarDaAbaStatus(texto);
        setAberto(false);
        setTexto('');
        alert("Status e Energias sincronizados com sucesso!");
    };

    return (
        <div style={{ marginBottom: '20px' }}>
            <button 
                className="btn-neon btn-small" 
                onClick={() => setAberto(!aberto)}
                style={{ 
                    margin: 0, 
                    padding: '8px 15px', 
                    fontSize: '0.85em', 
                    borderColor: '#00ffcc', 
                    color: '#00ffcc',
                    boxShadow: aberto ? '0 0 15px rgba(0,255,204,0.4)' : 'none',
                    transition: 'all 0.2s'
                }}
            >
                {aberto ? '❌ CANCELAR SINCRONIZAÇÃO' : '📥 IMPORTAR DO GOOGLE DOCS'}
            </button>

            {aberto && (
                <div className="fade-in" style={{ 
                    marginTop: '15px', 
                    background: 'rgba(0,255,204,0.05)', 
                    padding: '20px', 
                    borderRadius: '8px', 
                    border: '1px dashed #00ffcc',
                    boxShadow: 'inset 0 0 20px rgba(0,255,204,0.1)' 
                }}>
                    <h4 style={{ color: '#00ffcc', margin: '0 0 10px 0' }}>📂 Importador Mágico (Aba de Status)</h4>
                    <p style={{ color: '#aaa', fontSize: '0.85em', marginBottom: '15px' }}>
                        Copie tudo da sua aba <b>STATUS</b> no Google Docs e cole na caixa abaixo. 
                        O sistema irá ler e atualizar a Vida, Mana, Aura, Chakra, Corpo e os seus Atributos Base automaticamente.
                    </p>
                    <textarea 
                        value={texto}
                        onChange={e => setTexto(e.target.value)}
                        placeholder="Cole aqui o seu texto... (Ex: Vida: 34000000 | Força = (+30000))"
                        style={{ 
                            width: '100%', 
                            height: '150px', 
                            background: 'rgba(0,0,0,0.8)', 
                            color: '#0f0', 
                            fontFamily: 'monospace',
                            border: '1px solid #333', 
                            borderRadius: '5px', 
                            padding: '12px', 
                            marginBottom: '15px', 
                            fontSize: '0.9em',
                            resize: 'vertical',
                            boxSizing: 'border-box'
                        }}
                    />
                    <button 
                        className="btn-neon btn-green" 
                        onClick={handleImportar} 
                        style={{ width: '100%', padding: '12px', fontWeight: 'bold', fontSize: '1em' }}
                    >
                        ⚡ SINCRONIZAR A MINHA FICHA
                    </button>
                </div>
            )}
        </div>
    );
}