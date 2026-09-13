import React from 'react';
import { useAcertoForm, STATS_LIST } from './AcertoFormContext';

const PROVIDER_FALLBACK = (
    <div style={{ color: '#888', padding: 10 }}>Acerto provider não encontrado</div>
);

export function AcertoClasseBuffs() {
    const ctx = useAcertoForm();
    if (!ctx) return PROVIDER_FALLBACK;
    const { bonusAcertoClasse, bonusMaestriaArma, nomesMaestriaArma } = ctx;
    if (bonusAcertoClasse <= 0 && bonusMaestriaArma <= 0) return null;
    return (
        <>
            {bonusAcertoClasse > 0 && <p style={{ color: '#0f0', fontSize: '0.85em', margin: '0 0 10px 0', textShadow: '0 0 5px rgba(0,255,0,0.5)' }}>✨ Instinto de Batalha: a sua classe e/ou Habilidades ativas concedem +{bonusAcertoClasse} de Acerto!</p>}
            {bonusMaestriaArma > 0 && <p style={{ color: '#00ffcc', fontSize: '0.85em', margin: '0 0 10px 0', textShadow: '0 0 5px rgba(0,255,204,0.5)' }}>⚔️ Mestre de Armas: A sua classe concede +{bonusMaestriaArma} de Acerto ao usar [{nomesMaestriaArma.join(', ')}]!</p>}
        </>
    );
}

export function AcertoStatsSelector() {
    const ctx = useAcertoForm();
    if (!ctx) return PROVIDER_FALLBACK;
    const { statsSelecionados, toggleStat } = ctx;
    return (
        <div style={{ marginBottom: 10 }}>
            <label style={{ color: '#aaa', fontSize: '0.85em' }}>Atributos de Acerto:</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 5 }}>
                {STATS_LIST.map(st => (
                    <label key={st.value} style={{ color: statsSelecionados.includes(st.value) ? '#f90' : '#888', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input type="checkbox" className="chk-stat-act" value={st.value} checked={statsSelecionados.includes(st.value)} onChange={() => toggleStat(st.value)} />
                        {st.label}
                    </label>
                ))}
            </div>
        </div>
    );
}

export function AcertoDadosConfig() {
    const ctx = useAcertoForm();
    if (!ctx) return PROVIDER_FALLBACK;
    const { dados, setDados, faces, setFaces, usarProficiencia, setUsarProficiencia, bonus, setBonus, profGlobal, bonusAcertoClasse, bonusMaestriaArma } = ctx;
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Dados Base</label><input className="input-neon" type="number" value={dados} onChange={e => setDados(e.target.value)} /></div>
            <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Faces</label><input className="input-neon" type="number" value={faces} onChange={e => setFaces(e.target.value)} /></div>
            <div><label style={{ color: '#00ffcc', fontSize: '0.85em', fontWeight: 'bold' }}>Arma Proficiente?</label><div style={{ display: 'flex', alignItems: 'center', height: '34px' }}><input type="checkbox" checked={usarProficiencia} onChange={e => setUsarProficiencia(e.target.checked)} style={{ transform: 'scale(1.5)', marginLeft: 10 }} />{usarProficiencia && <span style={{ color: '#00ffcc', marginLeft: 8, fontWeight: 'bold' }}>+{profGlobal}</span>}</div></div>
            <div>
                <label style={{ color: '#aaa', fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: '5px' }}>Bônus Fixo / Temp.{(bonusAcertoClasse > 0 || bonusMaestriaArma > 0) && <span style={{ color: '#0f0', fontSize: '0.9em', fontWeight: 'bold' }}>(Buff: +{bonusAcertoClasse + bonusMaestriaArma})</span>}</label>
                <input className="input-neon" type="number" value={bonus} onChange={e => setBonus(e.target.value)} />
            </div>
        </div>
    );
}

export function AcertoVantagensGrid() {
    const ctx = useAcertoForm();
    if (!ctx) return PROVIDER_FALLBACK;
    const { vantagens, desvantagens, changeVantagem, changeDesvantagem } = ctx;
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10, padding: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 5 }}>
            <div><label style={{ color: '#0f0', fontSize: '0.85em' }}>+ Vantagens</label><input className="input-neon" type="number" min="0" value={vantagens} onChange={changeVantagem} style={{ borderColor: '#0f0', color: '#0f0' }} /></div>
            <div><label style={{ color: '#ff003c', fontSize: '0.85em' }}>- Desvantagens</label><input className="input-neon" type="number" min="0" value={desvantagens} onChange={changeDesvantagem} style={{ borderColor: '#ff003c', color: '#ff003c' }} /></div>
        </div>
    );
}

export function AcertoArsenalScanner() {
    const ctx = useAcertoForm();
    if (!ctx) return PROVIDER_FALLBACK;
    const { armasEquipadas } = ctx;
    if (armasEquipadas.length === 0) return null;
    return (
        <div style={{ marginTop: 15, padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', borderLeft: '2px solid #aaa' }}>
            <span style={{ color: '#aaa', fontSize: '0.75em', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>🔍 Scanner de Arsenal:</span>
            {armasEquipadas.map((w, idx) => (
                <div key={idx} style={{ color: '#ccc', fontSize: '0.8em' }}>• {w.nome} <span style={{ color: '#00ffcc' }}>(Categoria: {w.armaTipo || 'Nenhuma'})</span></div>
            ))}
        </div>
    );
}

// 🔥 HUD ATUALIZADO COM OS OPÇÕES DE ORIGEM E FILTRO 🔥
export function AcertoDistanciaHUD() {
    const ctx = useAcertoForm();
    if (!ctx) return PROVIDER_FALLBACK;

    const { 
        alvoDummie, distQuadrados, distReal, maxAlcance, maxArea, isForaDeAlcance, unidadeEscala,
        origemArea, setOrigemArea, coordLivreX, setCoordLivreX, coordLivreY, setCoordLivreY, alvoFiltro, setAlvoFiltro
    } = ctx;

    const alvoTexto = origemArea === 'alvo' ? (alvoDummie?.nome || 'Nenhum Alvo!') : origemArea === 'self' ? 'Meu Personagem' : `Célula Livre [${coordLivreX}, ${coordLivreY}]`;

    return (
        <div style={{ marginTop: 15, padding: '15px', background: isForaDeAlcance ? 'rgba(255,0,0,0.1)' : 'rgba(0,136,255,0.1)', border: `2px solid ${isForaDeAlcance ? '#ff003c' : '#0088ff'}`, borderRadius: '5px' }}>
            
            {maxArea > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 15, marginBottom: 15, paddingBottom: 15, borderBottom: `1px solid ${isForaDeAlcance ? '#ff003c' : '#0088ff'}` }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ color: '#fff', fontSize: '0.85em', fontWeight: 'bold' }}>Origem da Explosão / Área:</label>
                        <select className="input-neon" value={origemArea} onChange={e => setOrigemArea(e.target.value)} style={{ marginTop: 4 }}>
                            <option value="alvo">Centrado no Alvo Selecionado</option>
                            <option value="self">Centrado em Mim (Emanação)</option>
                            <option value="livre">Coordenada Geográfica Livre</option>
                        </select>
                        {origemArea === 'livre' && (
                            <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                                <input className="input-neon" type="number" placeholder="X" value={coordLivreX} onChange={e => setCoordLivreX(e.target.value)} />
                                <input className="input-neon" type="number" placeholder="Y" value={coordLivreY} onChange={e => setCoordLivreY(e.target.value)} />
                            </div>
                        )}
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ color: '#0f0', fontSize: '0.85em', fontWeight: 'bold' }}>Alvos Afetados (Fogo Amigo):</label>
                        <select className="input-neon" value={alvoFiltro} onChange={e => setAlvoFiltro(e.target.value)} style={{ marginTop: 4, borderColor: '#0f0' }}>
                            <option value="todos">Todos na Área (Dano Colateral!)</option>
                            <option value="inimigos">Apenas Inimigos (Ignorar Aliados)</option>
                            <option value="aliados">Apenas Aliados (Ignorar Inimigos)</option>
                        </select>
                    </div>
                </div>
            )}

            <div style={{ textAlign: 'center' }}>
                <span style={{ color: isForaDeAlcance ? '#ff003c' : '#fff', fontWeight: 'bold', fontSize: '1.1em' }}>
                    🎯 Foco Geométrico: {alvoTexto} <br/> 
                    Distância de Mim até lá: {distQuadrados}Q ({distReal.toFixed(1)} {unidadeEscala})
                </span>
                <br />
                <span style={{ color: '#aaa', fontSize: '0.85em' }}>
                    Seu Alcance Máx: <strong style={{color:'#fff'}}>{maxAlcance}Q</strong> 
                    {maxArea > 0 && <span style={{color: '#ff00ff', fontWeight: 'bold'}}> | Raio da Explosão: {maxArea}Q</span>}
                </span>
                {isForaDeAlcance && origemArea !== 'self' && <div style={{ color: '#ff003c', marginTop: 5, fontWeight: 'bold', textShadow: '0 0 5px #ff003c' }}>⚠️ FORA DE ALCANCE! APROXIME-SE!</div>}
            </div>
        </div>
    );
}

export function AcertoRolarButton() {
    const ctx = useAcertoForm();
    if (!ctx) return PROVIDER_FALLBACK;
    const { alvoSelecionado, alvoDummie, isForaDeAlcance, maxArea, origemArea, rolarAcerto } = ctx;

    const podeLancar = !isForaDeAlcance || origemArea === 'self';
    const alvoValido = alvoDummie || origemArea === 'self' || origemArea === 'livre';

    return (
        <button
            className="btn-neon btn-gold"
            onClick={rolarAcerto}
            disabled={!podeLancar}
            style={{ marginTop: 15, width: '100%', borderColor: podeLancar ? '#f90' : '#555', color: podeLancar ? '#f90' : '#555', opacity: podeLancar ? 1 : 0.5 }}
        >
            {alvoValido
                ? (!podeLancar ? 'MUITO LONGE PARA LANÇAR' : (maxArea > 0 ? `💥 DISPARAR EM ÁREA / ZONA` : `TENTAR ACERTAR O ALVO`))
                : 'ROLAR ACERTO LIVRE'}
        </button>
    );
}