import React from 'react';
import { useAtaqueForm, STATS_LIST, ENERGIA_LIST } from './AtaqueFormContext';

const PROVIDER_FALLBACK = (
    <div style={{ color: '#888', padding: 10 }}>Ataque provider nao encontrado</div>
);

export function AtaqueElementoSelector() {
    const ctx = useAtaqueForm();
    if (!ctx) return null;
    const { elementoAtivo, setElementoAtivo, elementosDinamicos } = ctx;

    return (
        <div className="def-box fade-in" style={{ marginBottom: 15, borderLeft: '4px solid #00ffcc' }}>
            <h4 style={{ color: '#00ffcc', margin: '0 0 10px 0', fontSize: '0.85em', textTransform: 'uppercase' }}>⚡ Infusão Elemental do Ataque</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {elementosDinamicos.map(el => (
                    <button 
                        key={el.id}
                        onClick={() => setElementoAtivo(el.id)}
                        className={`btn-neon ${elementoAtivo === el.id ? 'btn-green' : ''}`}
                        style={{ 
                            flex: '1 1 80px', padding: '6px', fontSize: '0.75em', margin: 0,
                            borderColor: elementoAtivo === el.id ? (el.cor || '#444') : '#444',
                            color: elementoAtivo === el.id ? '#fff' : '#888',
                            background: elementoAtivo === el.id ? `${el.cor || '#00ffcc'}30` : 'transparent'
                        }}
                    >
                        {el.icone} {el.nome}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function AtaqueFuriaDisplay() {
    const ctx = useAtaqueForm();
    if (!ctx) return PROVIDER_FALLBACK;

    const { multiplicadorFuriaClasse, multiplicadorFuriaVisor, percAtualLostFloor, percEfetivoParaDisplay, furiaAcalmadaMsg, acalmarFuria } = ctx;

    if (multiplicadorFuriaClasse <= 0) return null;

    return (
        <div className="def-box fade-in" style={{ marginBottom: 15, background: 'rgba(255, 0, 0, 0.1)', border: '1px solid rgba(255,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: '#ff0000', margin: 0, textShadow: '0 0 5px #ff0000' }}>🩸 Furia Berserker (Mad Enhancement)</h3>
                <button className="btn-neon btn-small" onClick={acalmarFuria} style={{ margin: 0, borderColor: furiaAcalmadaMsg ? '#0f0' : '#fff', color: furiaAcalmadaMsg ? '#0f0' : '#fff' }}>{furiaAcalmadaMsg ? '✨ FÚRIA RESETADA!' : 'Acalmar Fúria'}</button>
            </div>
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px' }}>
                    <span style={{ color: '#aaa', fontSize: '0.8em', display: 'block' }}>Vida Perdida Atual:</span>
                    <span style={{ color: '#ffcc00', fontSize: '1.2em', fontWeight: 'bold' }}>{percAtualLostFloor}%</span>
                </div>
                <div style={{ background: 'rgba(255,0,0,0.2)', padding: '10px', borderRadius: '5px', borderLeft: '3px solid #ff0000' }}>
                    <span style={{ color: '#aaa', fontSize: '0.8em', display: 'block' }}>Máximo Atingido (Mantido após Cura):</span>
                    <span style={{ color: '#ff0000', fontSize: '1.2em', fontWeight: 'bold' }}>{percEfetivoParaDisplay}%</span>
                </div>
            </div>
            <p style={{ color: '#0f0', fontSize: '0.9em', marginTop: 10, marginBottom: 0 }}>↳ Bônus no Multiplicador Geral: <strong style={{ color: '#fff' }}>+{multiplicadorFuriaVisor}x</strong></p>
        </div>
    );
}

export function AtaqueCriticoConfig() {
    const ctx = useAtaqueForm();
    if (!ctx) return PROVIDER_FALLBACK;
    const {
        critNormalMin, setCritNormalMin, critNormalMax, setCritNormalMax,
        critFatalMin, setCritFatalMin, critFatalMax, setCritFatalMax,
        autoCritNormal, autoCritFatal, forcarCritNormal, setForcarCritNormal,
        forcarCritFatal, setForcarCritFatal
    } = ctx;

    return (
        <div className="def-box" style={{ marginBottom: 15 }}>
            <h3 style={{ color: '#0ff', margin: '0 0 10px 0' }}>Configuração de Crítico</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 5, borderLeft: '3px solid #ffcc00' }}>
                    <div style={{ color: '#ffcc00', fontSize: '0.85em', fontWeight: 'bold', marginBottom: 5 }}>⚡ CRÍTICO NORMAL</div>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        <input className="input-neon" type="number" min="1" max="20" value={critNormalMin} onChange={e => setCritNormalMin(e.target.value)} style={{ width: 50, padding: 4 }} />
                        <span style={{ color: '#aaa' }}>a</span>
                        <input className="input-neon" type="number" min="1" max="20" value={critNormalMax} onChange={e => setCritNormalMax(e.target.value)} style={{ width: 50, padding: 4 }} />
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
                        {autoCritNormal && <span style={{ background: '#ffcc00', color: '#000', padding: '2px 6px', borderRadius: 4, fontSize: '0.75em', fontWeight: 'bold' }}>AUTO ATIVADO</span>}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#aaa', fontSize: '0.8em', cursor: 'pointer' }}>
                            <input type="checkbox" checked={forcarCritNormal} onChange={e => setForcarCritNormal(e.target.checked)} /> Forçar Ativação
                        </label>
                    </div>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 5, borderLeft: '3px solid #ff003c' }}>
                    <div style={{ color: '#ff003c', fontSize: '0.85em', fontWeight: 'bold', marginBottom: 5 }}>🔥 CRÍTICO FATAL</div>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        <input className="input-neon" type="number" min="1" max="20" value={critFatalMin} onChange={e => setCritFatalMin(e.target.value)} style={{ width: 50, padding: 4 }} />
                        <span style={{ color: '#aaa' }}>a</span>
                        <input className="input-neon" type="number" min="1" max="20" value={critFatalMax} onChange={e => setCritFatalMax(e.target.value)} style={{ width: 50, padding: 4 }} />
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
                        {autoCritFatal && <span style={{ background: '#ff003c', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: '0.75em', fontWeight: 'bold' }}>AUTO ATIVADO</span>}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#aaa', fontSize: '0.8em', cursor: 'pointer' }}>
                            <input type="checkbox" checked={forcarCritFatal} onChange={e => setForcarCritFatal(e.target.checked)} /> Forçar Ativação
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function AtaqueArmaEquipada() {
    const ctx = useAtaqueForm();
    if (!ctx) return PROVIDER_FALLBACK;
    const { armaEquipada, armaStatusUsados, toggleArmaStat, armaEnergiaCombustao, setArmaEnergiaCombustao, armaPercEnergia, setArmaPercEnergia } = ctx;

    if (!armaEquipada) return null;

    return (
        <div className="def-box" style={{ marginBottom: 15, borderLeft: '3px solid #0f0' }}>
            <h3 style={{ color: '#0f0', margin: '0 0 10px 0' }}>⚔️ Arma Equipada: {armaEquipada.nome}</h3>
            <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Status Somados ao Multiplicador</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                        {STATS_LIST.map(st => (
                            <button key={st.value} className={`btn-neon ${armaStatusUsados.includes(st.value) ? 'btn-gold' : ''}`} onClick={() => toggleArmaStat(st.value)} style={{ padding: '4px 8px', fontSize: '0.75em', margin: 0 }}>
                                {st.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div style={{ flex: 1, minWidth: '200px', background: 'rgba(0,255,255,0.05)', padding: 10, borderRadius: 5 }}>
                    <label style={{ color: '#0ff', fontSize: '0.85em', fontWeight: 'bold' }}>Energia de Combustão da Arma</label>
                    <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
                        <select className="input-neon" value={armaEnergiaCombustao} onChange={e => setArmaEnergiaCombustao(e.target.value)} style={{ flex: 1, padding: 5 }}>
                            {ENERGIA_LIST.map(en => <option key={en.value} value={en.value}>{en.label}</option>)}
                        </select>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <input className="input-neon" type="number" min="0" max="100" value={armaPercEnergia} onChange={e => setArmaPercEnergia(e.target.value)} style={{ width: 60, padding: 5 }} />
                            <span style={{ color: '#aaa' }}>%</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function AtaqueArmaVazia() {
    const ctx = useAtaqueForm();
    if (!ctx) return PROVIDER_FALLBACK;
    if (ctx.armaEquipada) return null;

    return (
        <div style={{ color: '#888', fontStyle: 'italic', marginBottom: 15, textAlign: 'center' }}>
            Nenhuma arma principal equipada no Inventário.
        </div>
    );
}

export function AtaqueHabilidadesAtivas() {
    const ctx = useAtaqueForm();
    if (!ctx) return PROVIDER_FALLBACK;
    const { poderesAtivos, skillConfigs, updateSkillConfig, toggleSkillStat, armaEquipada } = ctx;

    if (!poderesAtivos || poderesAtivos.length === 0) return null;

    return (
        <div className="def-box" style={{ marginBottom: 15, borderLeft: '3px solid #ffcc00' }}>
            <h3 style={{ color: '#ffcc00', margin: '0 0 10px 0' }}>✨ Habilidades Ativadas</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {poderesAtivos.map(hab => {
                    const cfg = skillConfigs[hab.id] || { statusUsados: ['forca'], energiaCombustao: 'mana' };
                    const vincStr = hab.armaVinculada && armaEquipada && String(hab.armaVinculada) === String(armaEquipada.id) ? ' (Vinculada à Arma)' : '';
                    return (
                        <div key={hab.id} style={{ background: 'rgba(0,0,0,0.4)', padding: 10, borderRadius: 5, border: '1px solid #444' }}>
                            <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: 8 }}>{hab.nome} <span style={{ color: '#0f0', fontSize: '0.8em' }}>{vincStr}</span></div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                {STATS_LIST.map(st => (
                                    <button key={st.value} className={`btn-neon ${cfg.statusUsados.includes(st.value) ? 'btn-gold' : ''}`} onClick={() => toggleSkillStat(hab.id, st.value)} style={{ padding: '2px 6px', fontSize: '0.7em', margin: 0 }}>
                                        {st.label}
                                    </button>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <span style={{ color: '#aaa', fontSize: '0.8em' }}>Combustão Extra ({hab.custoPercentual || 0}%):</span>
                                <select className="input-neon" value={cfg.energiaCombustao} onChange={e => updateSkillConfig(hab.id, 'energiaCombustao', e.target.value)} style={{ width: 120, padding: 2, fontSize: '0.8em' }}>
                                    {ENERGIA_LIST.map(en => <option key={en.value} value={en.value}>{en.label}</option>)}
                                </select>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function AtaqueMagiasPreparadas() {
    const ctx = useAtaqueForm();
    if (!ctx) return PROVIDER_FALLBACK;
    const { magiasOfensivas, skillConfigs, updateSkillConfig, toggleSkillStat } = ctx;

    if (!magiasOfensivas || magiasOfensivas.length === 0) return null;

    return (
        <div className="def-box" style={{ marginBottom: 15, borderLeft: '3px solid #ff00ff' }}>
            <h3 style={{ color: '#ff00ff', margin: '0 0 10px 0' }}>🔮 Magias Preparadas</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {magiasOfensivas.map(mag => {
                    const cfg = skillConfigs[mag.id] || { statusUsados: ['inteligencia'], energiaCombustao: 'mana' };
                    return (
                        <div key={mag.id} style={{ background: 'rgba(0,0,0,0.4)', padding: 10, borderRadius: 5, border: '1px solid #444' }}>
                            <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: 8 }}>{mag.nome} <span style={{ color: '#ff00ff', fontSize: '0.8em' }}>({mag.elemento || 'Neutro'})</span></div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                {STATS_LIST.map(st => (
                                    <button key={st.value} className={`btn-neon ${cfg.statusUsados.includes(st.value) ? 'btn-gold' : ''}`} onClick={() => toggleSkillStat(mag.id, st.value)} style={{ padding: '2px 6px', fontSize: '0.7em', margin: 0 }}>
                                        {st.label}
                                    </button>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <span style={{ color: '#aaa', fontSize: '0.8em' }}>Combustão Base ({mag.custoValor || 0}%):</span>
                                <select className="input-neon" value={cfg.energiaCombustao} onChange={e => updateSkillConfig(mag.id, 'energiaCombustao', e.target.value)} style={{ width: 120, padding: 2, fontSize: '0.8em' }}>
                                    <option value="mana">Mana</option>
                                    <option value="aura">Aura</option>
                                    <option value="chakra">Chakra</option>
                                    <option value="livre">Livre</option>
                                </select>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function AtaqueDanoCustomizado() {
    const ctx = useAtaqueForm();
    if (!ctx) return PROVIDER_FALLBACK;
    
    const { 
        customFormula, setCustomFormula, 
        customLetalidade, setCustomLetalidade, 
        customEnergiaTipo, setCustomEnergiaTipo,
        customEnergiaCusto, setCustomEnergiaCusto,
        rolarDanoCustomizado, salvarFormula, deletarFormula, minhaFicha 
    } = ctx;

    const formulasSalvas = minhaFicha?.ataqueConfig?.formulasSalvas || [];

    return (
        <div className="def-box fade-in" style={{ marginBottom: 15, background: 'rgba(255, 0, 255, 0.05)', border: '1px solid #ff00ff' }}>
            <h3 style={{ color: '#ff00ff', margin: '0 0 5px 0' }}>🧩 Modo Deus (Fórmula Customizada)</h3>
            <p style={{ color: '#aaa', fontSize: '0.8em', margin: '0 0 10px 0' }}>Enquanto o sistema não automatiza sua ficha inteira, digite a matemática maluca aqui e deixe a engine rolar.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input 
                        className="input-neon" 
                        type="text" 
                        placeholder="Ex: ((5d10 x 61000) x 2) x 20" 
                        value={customFormula} 
                        onChange={e => setCustomFormula(e.target.value)} 
                        style={{ flex: '1 1 250px', fontSize: '1.1em', borderColor: '#ff00ff', color: '#fff', margin: 0 }}
                    />
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#111', padding: '5px', borderRadius: 5, border: '1px solid #ff00ff' }}>
                        <span style={{ color: '#ffcc00', fontSize: '0.8em', fontWeight: 'bold' }}>+Letalidade:</span>
                        <input 
                            className="input-neon" 
                            type="number" 
                            value={customLetalidade} 
                            onChange={e => setCustomLetalidade(e.target.value)} 
                            style={{ width: 60, margin: 0, padding: 4 }} 
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#111', padding: '5px', borderRadius: 5, border: '1px solid #00ffcc' }}>
                        <span style={{ color: '#00ffcc', fontSize: '0.8em', fontWeight: 'bold' }}>⚡ Débito:</span>
                        <select 
                            className="input-neon" 
                            value={customEnergiaTipo} 
                            onChange={e => setCustomEnergiaTipo(e.target.value)} 
                            style={{ padding: '2px 4px', fontSize: '0.85em', borderColor: '#00ffcc', color: '#00ffcc', margin: 0 }}
                        >
                            <option value="nenhum">Nenhum</option>
                            <option value="mana">Mana</option>
                            <option value="aura">Aura</option>
                            <option value="chakra">Chakra</option>
                            <option value="corpo">Corpo</option>
                        </select>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <input 
                                className="input-neon" 
                                type="number" 
                                placeholder="%"
                                value={customEnergiaCusto} 
                                onChange={e => setCustomEnergiaCusto(e.target.value)} 
                                style={{ width: 55, margin: 0, padding: 4, borderColor: '#00ffcc', textAlign: 'center' }} 
                            />
                            <span style={{ color: '#00ffcc', fontSize: '0.85em', fontWeight: 'bold' }}>%</span>
                        </div>
                    </div>

                    <button 
                        className="btn-neon btn-blue" 
                        onClick={salvarFormula}
                        title="Salvar esta fórmula na memória"
                        style={{ padding: '0 15px', fontSize: '1.2em', margin: 0, height: '42px', borderColor: '#00aaff', color: '#00aaff' }}
                    >
                        💾
                    </button>

                    <button 
                        className="btn-neon" 
                        onClick={() => rolarDanoCustomizado()}
                        style={{ flex: '1 1 120px', height: '42px', background: 'rgba(255,0,255,0.2)', borderColor: '#ff00ff', color: '#ff00ff', fontWeight: 'bold', margin: 0 }}
                    >
                        🎲 ROLAR
                    </button>
                </div>
            </div>

            {formulasSalvas.length > 0 && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed rgba(255,0,255,0.3)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {formulasSalvas.map(f => (
                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.5)', border: '1px solid #ff00ff', borderRadius: '20px', overflow: 'hidden' }}>
                            <button 
                                onClick={() => rolarDanoCustomizado(f.formula, f.letalidade, f.energiaTipo, f.energiaCusto)}
                                style={{ background: 'none', border: 'none', color: '#fff', padding: '4px 10px', fontSize: '0.85em', cursor: 'pointer', fontWeight: 'bold' }}
                                title={`Fórmula: ${f.formula} | Letalidade: +${f.letalidade || 0}${f.energiaTipo && f.energiaTipo !== 'nenhum' && f.energiaCusto ? ` | Custo: ${f.energiaCusto}% ${f.energiaTipo}` : ''}`}
                            >
                                ▶ {f.nome}
                            </button>
                            <button 
                                onClick={() => { 
                                    setCustomFormula(f.formula); 
                                    setCustomLetalidade(f.letalidade || 0); 
                                    setCustomEnergiaTipo(f.energiaTipo || 'nenhum');
                                    setCustomEnergiaCusto(f.energiaCusto || 0);
                                }}
                                style={{ background: 'none', border: 'none', borderLeft: '1px solid #444', color: '#ffcc00', padding: '4px 8px', fontSize: '0.85em', cursor: 'pointer' }}
                                title="Editar"
                            >
                                ✏️
                            </button>
                            <button 
                                onClick={() => deletarFormula(f.id)}
                                style={{ background: 'rgba(255,0,0,0.2)', border: 'none', borderLeft: '1px solid #444', color: '#ff003c', padding: '4px 8px', fontSize: '0.85em', cursor: 'pointer' }}
                                title="Apagar"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function AtaqueBotoesAcao() {
    const ctx = useAtaqueForm();
    if (!ctx) return PROVIDER_FALLBACK;

    const { podeRolarDano, dummieAlvo, ignorarTravaAcerto, setIgnorarTravaAcerto, salvarConfigAtaque, rolarDano } = ctx;

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, marginBottom: 5 }}>
                <label style={{ color: '#aaa', fontSize: '0.85em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <input type="checkbox" checked={ignorarTravaAcerto} onChange={e => setIgnorarTravaAcerto(e.target.checked)} style={{ transform: 'scale(1.2)' }}/>
                    Ignorar Trava de Acerto (P/ Saving Throws ou Área)
                </label>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
                <button className="btn-neon btn-gold" onClick={salvarConfigAtaque} style={{ flex: 1 }}>Salvar Config</button>
                <button
                    className={`btn-neon ${(podeRolarDano || ignorarTravaAcerto) ? 'btn-red' : ''}`}
                    onClick={rolarDano}
                    style={{ flex: 1, opacity: (podeRolarDano || ignorarTravaAcerto) ? 1 : 0.5 }}
                    disabled={!podeRolarDano && !ignorarTravaAcerto}
                >
                    {dummieAlvo ? ((podeRolarDano || ignorarTravaAcerto) ? `ATACAR ${String(dummieAlvo.nome || 'alvo').toUpperCase()}` : 'ACERTO NECESSARIO') : 'ROLAR DANO'}
                </button>
            </div>
        </>
    );
}