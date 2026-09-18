import React from 'react';
import { useTestesForm, SAVES, SKILLS } from './TestesFormContext';
import { salvarFichaSilencioso } from '../../services/firebase-sync';

export function TestesModificadoresGlobais() {
    const ctx = useTestesForm();
    if (!ctx) return <div className="def-box" style={{ opacity: 0.5 }}>Modificadores Globais (sem contexto)</div>;

    const { minhaFicha, dadosConfig, setDadosConfig, facesConfig, setFacesConfig, bonusConfig, setBonusConfig, updateFicha } = ctx;

    return (
        <div className="def-box" style={{ border: '1px solid #00ffcc', background: 'rgba(0, 255, 204, 0.05)' }}>
            <h3 style={{ color: '#00ffcc', marginTop: 0, marginBottom: 10 }}>Modificadores Globais</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 15 }}>

                <div style={{ background: 'rgba(255,204,0,0.1)', padding: '5px 10px', borderRadius: 5, borderLeft: '3px solid #ffcc00' }}>
                    <label style={{ color: '#ffcc00', fontSize: '0.85em', fontWeight: 'bold' }}>Sua Proficiencia (Base)</label>
                    <input
                        className="input-neon"
                        type="number"
                        min="0"
                        value={minhaFicha.proficienciaBase ?? 2}
                        onChange={e => {
                            updateFicha(f => { f.proficienciaBase = parseInt(e.target.value) || 0; });
                            salvarFichaSilencioso();
                        }}
                        style={{ borderColor: '#ffcc00', color: '#ffcc00', width: '100%' }}
                    />
                </div>

                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Qtd. Dados</label>
                    <input className="input-neon" type="number" min="1" value={dadosConfig} onChange={e => setDadosConfig(e.target.value)} />
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Faces (d)</label>
                    <input className="input-neon" type="number" min="2" value={facesConfig} onChange={e => setFacesConfig(e.target.value)} />
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Bonus Fixo Extra (+)</label>
                    <input className="input-neon" type="number" value={bonusConfig} onChange={e => setBonusConfig(e.target.value)} />
                </div>
            </div>
        </div>
    );
}

export function TestesSavingThrows() {
    const ctx = useTestesForm();
    if (!ctx) return <div className="def-box" style={{ opacity: 0.5 }}>Saving Throws (sem contexto)</div>;

    const { profGlobal, getModificadorDoisDigitos, getProfLevel, toggleProf, executarRolagem } = ctx;

    return (
        <div className="def-box">
            <h3 style={{ color: '#ffcc00', marginTop: 0, marginBottom: 15 }}>Saving Throws (Resistencias)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                {SAVES.map(save => {
                    const pNivel = getProfLevel(save.id);
                    const valBase = getModificadorDoisDigitos(save.attr);
                    const totalMod = valBase + (pNivel * profGlobal);

                    return (
                        <div key={save.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <button
                                className="btn-neon"
                                onClick={() => executarRolagem(save.id, save.label, save.attr, true)}
                                style={{ borderColor: save.cor, color: save.cor, margin: 0, padding: '10px 5px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                            >
                                <span style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{save.label}</span>
                                <span style={{ fontSize: '0.8em', color: '#fff', marginTop: 4 }}>Mod Total: +{totalMod}</span>
                            </button>
                            <button
                                className="btn-neon"
                                onClick={() => toggleProf(save.id)}
                                style={{ padding: '2px', fontSize: '0.8em', borderColor: pNivel === 2 ? '#ffcc00' : pNivel === 1 ? '#00ffcc' : '#444', color: '#fff', margin: 0, background: pNivel > 0 ? 'rgba(0,0,0,0.5)' : 'transparent' }}
                            >
                                {pNivel === 2 ? 'Expertise (x2)' : pNivel === 1 ? 'Proficiente' : 'S/ Prof.'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function TestesHabilidades() {
    const ctx = useTestesForm();
    if (!ctx) return <div className="def-box" style={{ opacity: 0.5 }}>Testes de Pericia (sem contexto)</div>;

    const { profGlobal, filtro, setFiltro, getModificadorDoisDigitos, getProfLevel, toggleProf, executarRolagem, skillsFiltradas } = ctx;

    return (
        <div className="def-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 15 }}>
                <h3 style={{ color: '#0088ff', margin: 0 }}>Testes de Pericia</h3>
                <input
                    className="input-neon"
                    type="text"
                    placeholder="Buscar Pericia..."
                    value={filtro}
                    onChange={e => setFiltro(e.target.value)}
                    style={{ width: '200px', margin: 0, borderColor: '#0088ff' }}
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                {skillsFiltradas.length > 0 ? skillsFiltradas.map(skill => {
                    const pNivel = getProfLevel(skill.id);
                    const valBase = getModificadorDoisDigitos(skill.attr);
                    const totalMod = valBase + (pNivel * profGlobal);

                    return (
                        <div key={skill.id} style={{ display: 'flex', gap: 5, alignItems: 'stretch' }}>
                            <button
                                className="btn-neon"
                                onClick={() => executarRolagem(skill.id, skill.label, skill.attr, false)}
                                style={{ flex: 1, borderColor: '#444', color: '#fff', margin: 0, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.4)', transition: 'border-color 0.2s' }}
                                onMouseOver={e => { e.currentTarget.style.borderColor = '#0088ff'; }}
                                onMouseOut={e => { e.currentTarget.style.borderColor = '#444'; }}
                            >
                                <span style={{ fontWeight: 'bold', textAlign: 'left' }}>{skill.label}</span>
                                <span style={{ fontSize: '0.7em', color: '#0088ff', background: 'rgba(0,136,255,0.2)', padding: '2px 6px', borderRadius: 4 }}>
                                    {skill.attr.substring(0, 3).toUpperCase()} (+{totalMod})
                                </span>
                            </button>
                            <button
                                className="btn-neon"
                                onClick={() => toggleProf(skill.id)}
                                style={{ padding: '0 10px', fontSize: '1.2em', borderColor: pNivel === 2 ? '#ffcc00' : pNivel === 1 ? '#00ffcc' : '#444', margin: 0, background: 'rgba(0,0,0,0.5)' }}
                                title={pNivel === 2 ? 'Expertise' : pNivel === 1 ? 'Proficiente' : 'Sem Proficiencia'}
                            >
                                {pNivel === 2 ? 'E' : pNivel === 1 ? 'P' : 'O'}
                            </button>
                        </div>
                    );
                }) : (
                    <p style={{ color: '#888', gridColumn: '1 / -1', textAlign: 'center' }}>Nenhuma pericia encontrada.</p>
                )}
            </div>
        </div>
    );
}
