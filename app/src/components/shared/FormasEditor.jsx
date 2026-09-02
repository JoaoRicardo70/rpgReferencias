import React, { useState } from 'react';
import { ATRIBUTOS_AGRUPADOS, PROPRIEDADE_OPTIONS } from '../../core/efeitos-constants';

export default function FormasEditor({ className, itemRaridade, formas, formaAtivaId, configAtivaId, onSalvarForma, onDeletarForma, onAtivarForma }) {
    const [mostrarFormas, setMostrarFormas] = useState(false);
    const [editando, setEditando] = useState(null);

    const listaFormas = formas || [];

    const criarNovaForma = () => {
        setEditando({
            id: Date.now(),
            nome: '',
            descricao: '',
            imagemUrl: '',
            acumulaFormaBase: true,
            maestria: 0,
            configs: [{
                id: Date.now() + 1,
                nome: 'Padrão',
                descricao: '', 
                imagemUrl: '', 
                efeitos: [], efeitosPassivos: [],
                tNomeA: '', tAtrA: 'forca', tPropA: 'base', tValA: '',
                tNomeP: '', tAtrP: 'forca', tPropP: 'base', tValP: ''
            }]
        });
        setMostrarFormas(true);
    };

    const iniciarEdicao = (forma) => {
        if (!forma) return;
        const copia = JSON.parse(JSON.stringify(forma));
        
        copia.descricao = copia.descricao || '';
        copia.imagemUrl = copia.imagemUrl || '';
        copia.maestria = copia.maestria || 0;

        copia.configs = (copia.configs || []).map(c => ({
            ...c,
            descricao: c.descricao || '',
            imagemUrl: c.imagemUrl || '',
            efeitos: c.efeitos || [], efeitosPassivos: c.efeitosPassivos || [],
            tNomeA: c.tNomeA || '', tAtrA: c.tAtrA || 'forca', tPropA: c.tPropA || 'base', tValA: c.tValA || '',
            tNomeP: c.tNomeP || '', tAtrP: c.tAtrP || 'forca', tPropP: c.tPropP || 'base', tValP: c.tValP || ''
        }));
        
        if (!copia.configs.length) {
            copia.configs.push({
                id: Date.now(), nome: 'Padrão', 
                descricao: '', imagemUrl: '',
                efeitos: copia.efeitos || [], 
                efeitosPassivos: copia.efeitosPassivos || [],
                tNomeA: '', tAtrA: 'forca', tPropA: 'base', tValA: '', 
                tNomeP: '', tAtrP: 'forca', tPropP: 'base', tValP: ''
            });
        }
        setEditando(copia);
    };

    const cancelarEdicao = () => setEditando(null);

    const handleFormaChange = (campo, valor) => setEditando({ ...editando, [campo]: valor });

    // 🔥 SISTEMA DE UPLOAD DE ARQUIVO (BASE64) 🔥
    const handleFormaImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => handleFormaChange('imagemUrl', reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handleConfigImageUpload = (cIdx, e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => handleConfigChange(cIdx, 'imagemUrl', reader.result);
            reader.readAsDataURL(file);
        }
    };

    const addConfig = () => {
        setEditando({
            ...editando,
            configs: [...(editando.configs || []), {
                id: Date.now(), nome: 'Nova Configuração', descricao: '', imagemUrl: '', efeitos: [], efeitosPassivos: [],
                tNomeA: '', tAtrA: 'forca', tPropA: 'base', tValA: '', 
                tNomeP: '', tAtrP: 'forca', tPropP: 'base', tValP: ''
            }]
        });
    };

    const removerConfig = (cIdx) => {
        const novas = (editando.configs || []).filter((_, i) => i !== cIdx);
        setEditando({ ...editando, configs: novas });
    };

    const handleConfigChange = (cIdx, campo, valor) => {
        const novas = [...(editando.configs || [])];
        if(novas[cIdx]) novas[cIdx][campo] = valor;
        setEditando({ ...editando, configs: novas });
    };

    const addEfeitoToConfig = (cIdx, isAtivo) => {
        const novas = [...(editando.configs || [])];
        const cfg = novas[cIdx];
        if (!cfg) return;
        
        if (isAtivo) {
            if (!cfg.tNomeA?.trim() || cfg.tValA === '') return alert('Preencha o nome e o valor do efeito! (Coloque 0 no valor se for uma habilidade mecânica/inata)');
            if (!cfg.efeitos) cfg.efeitos = [];
            cfg.efeitos.push({ nome: cfg.tNomeA.trim(), atributo: cfg.tAtrA || 'forca', propriedade: cfg.tPropA || 'base', valor: cfg.tValA });
            cfg.tValA = '';
            cfg.tNomeA = '';
        } else {
            if (!cfg.tNomeP?.trim() || cfg.tValP === '') return alert('Preencha o nome e o valor do efeito passivo! (Coloque 0 no valor se for uma habilidade mecânica/inata)');
            if (!cfg.efeitosPassivos) cfg.efeitosPassivos = [];
            cfg.efeitosPassivos.push({ nome: cfg.tNomeP.trim(), atributo: cfg.tAtrP || 'forca', propriedade: cfg.tPropP || 'base', valor: cfg.tValP });
            cfg.tValP = '';
            cfg.tNomeP = '';
        }
        setEditando({ ...editando, configs: novas });
    };

    const removeEfeitoFromConfig = (cIdx, eIdx, isAtivo) => {
        const novas = [...(editando.configs || [])];
        if (!novas[cIdx]) return;
        
        if (isAtivo) {
            novas[cIdx].efeitos = (novas[cIdx].efeitos || []).filter((_, i) => i !== eIdx);
        } else {
            novas[cIdx].efeitosPassivos = (novas[cIdx].efeitosPassivos || []).filter((_, i) => i !== eIdx);
        }
        setEditando({ ...editando, configs: novas });
    };

    const salvar = () => {
        if (!editando.nome || !editando.nome.trim()) return alert('Dê um nome à Forma!');
        const formaLimpa = JSON.parse(JSON.stringify(editando));
        
        formaLimpa.configs = (formaLimpa.configs || []).map(c => {
            delete c.tNomeA; delete c.tAtrA; delete c.tPropA; delete c.tValA;
            delete c.tNomeP; delete c.tAtrP; delete c.tPropP; delete c.tValP;
            return c;
        });
        
        formaLimpa.efeitos = []; 
        formaLimpa.efeitosPassivos = [];

        onSalvarForma(formaLimpa);
        setEditando(null);
    };

    return (
        <div className={className} style={{ marginTop: 10 }}>
            <button className="btn-neon" onClick={() => setMostrarFormas(!mostrarFormas)} style={{ padding: '4px 12px', fontSize: '0.85em', margin: 0, borderColor: '#ff8800', color: '#ff8800' }}>
                {mostrarFormas ? '▼' : '▶'} FORMAS MÍSTICAS ({listaFormas.length})
            </button>

            {mostrarFormas && (
                <div style={{ marginTop: 8, padding: 10, background: 'rgba(255,136,0,0.05)', borderLeft: '3px solid #ff8800', borderRadius: 4 }}>
                    
                    {/* MODO VISÃO LORE / COMPÊNDIO */}
                    {!editando ? (
                        <>
                            {listaFormas.map(forma => {
                                if (!forma) return null;
                                const isAtiva = formaAtivaId === forma.id;
                                const totalEfeitos = (forma.configs || []).reduce((acc, c) => acc + ((c.efeitos || []).length) + ((c.efeitosPassivos || []).length), 0);

                                return (
                                    <div key={forma.id} style={{ marginBottom: 15, padding: '15px', background: isAtiva ? 'rgba(255,136,0,0.15)' : 'rgba(0,0,0,0.4)', borderRadius: 4, borderLeft: isAtiva ? '4px solid #ff8800' : '4px solid #555' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                            <div style={{ display: 'flex', gap: 15 }}>
                                                {forma.imagemUrl && (
                                                    <img src={forma.imagemUrl} alt={forma.nome} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '2px solid #ff8800' }} />
                                                )}
                                                <div>
                                                    <h3 style={{ margin: 0, color: isAtiva ? '#ff8800' : '#aaa', textShadow: isAtiva ? '0 0 10px #ff8800' : 'none' }}>
                                                        {forma.nome || '(Sem Nome)'}
                                                        {(parseFloat(forma.maestria) || 0) > 0 && (
                                                            <span style={{ marginLeft: 8, fontSize: '0.6em', color: '#00ff88', border: '1px solid #00ff88', borderRadius: 3, padding: '2px 6px', verticalAlign: 'middle' }} title="Reduz a Fadiga gerada por esta Forma no Mapa">
                                                                🥋 {Math.min(100, Math.max(0, parseFloat(forma.maestria) || 0))}% Maestria
                                                            </span>
                                                        )}
                                                    </h3>
                                                    <span style={{ color: '#666', fontSize: '0.85em' }}>{forma.acumulaFormaBase !== false ? '+ Acumula com os bónus base da arma' : 'Substitui os bónus base da arma'}</span>
                                                    {forma.descricao && <p style={{ color: '#ccc', fontSize: '0.9em', fontStyle: 'italic', margin: '8px 0 0 0', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{forma.descricao}</p>}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                                                <button className="btn-neon btn-blue" style={{ padding: '3px 12px', fontSize: '0.8em', margin: 0 }} onClick={() => iniciarEdicao(forma)}>EDITAR</button>
                                                <button className="btn-neon btn-red" style={{ padding: '3px 12px', fontSize: '0.8em', margin: 0 }} onClick={() => onDeletarForma(forma.id)}>APAGAR</button>
                                            </div>
                                        </div>

                                        {/* RENDERIZAÇÃO DAS CONFIGURAÇÕES (PECADOS) COM IMAGENS */}
                                        <div style={{ marginTop: 15, display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                                            {(forma.configs || []).map(cfg => {
                                                if (!cfg) return null;
                                                const isConfigAtiva = isAtiva && configAtivaId === cfg.id;
                                                return (
                                                    <div key={cfg.id} style={{ background: isConfigAtiva ? 'rgba(255, 204, 0, 0.1)' : 'rgba(0,0,0,0.5)', border: isConfigAtiva ? '1px solid #ffcc00' : '1px solid #333', padding: 10, borderRadius: 5, display: 'flex', gap: 15, alignItems: 'center' }}>
                                                        {cfg.imagemUrl && (
                                                            <img src={cfg.imagemUrl} alt={cfg.nome} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4, border: '1px solid #ffcc00' }} />
                                                        )}
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <strong style={{ color: isConfigAtiva ? '#ffcc00' : '#ffaa00', fontSize: '1.1em' }}>{cfg.nome || 'Modo Padrão'}</strong>
                                                                <button 
                                                                    className={`btn-neon ${isConfigAtiva ? 'btn-gold' : ''}`}
                                                                    onClick={() => onAtivarForma(isConfigAtiva ? null : forma.id, isConfigAtiva ? null : cfg.id)}
                                                                    style={{ padding: '4px 12px', fontSize: '0.8em', margin: 0, borderColor: isConfigAtiva ? '#ffcc00' : '#444', color: isConfigAtiva ? '#fff' : '#aaa' }}
                                                                >
                                                                    {isConfigAtiva ? 'DESATIVAR MODO' : 'ATIVAR MODO'}
                                                                </button>
                                                            </div>
                                                            {cfg.descricao && <p style={{ color: '#aaa', fontSize: '0.85em', margin: '5px 0 0 0', whiteSpace: 'pre-wrap', lineHeight: '1.3' }}>{cfg.descricao}</p>}
                                                            
                                                            <div style={{ display: 'flex', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
                                                                {(cfg.efeitos || []).length > 0 && <span style={{ color: '#0ff', fontSize: '0.7em' }}>⚡ {cfg.efeitos.length} Ativos</span>}
                                                                {(cfg.efeitosPassivos || []).length > 0 && <span style={{ color: '#f0f', fontSize: '0.7em' }}>🛡️ {cfg.efeitosPassivos.length} Passivos</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                            <button className="btn-neon btn-gold" onClick={criarNovaForma} style={{ width: '100%', padding: '8px', fontSize: '1em' }}>+ FORJAR NOVA FORMA MÍSTICA</button>
                        </>

                    // MODO EDIÇÃO DO MESTRE
                    ) : (
                        <div style={{ background: 'rgba(20,20,20,0.9)', borderLeft: '4px solid #00ffcc', padding: 15, borderRadius: 4 }}>
                            <h4 style={{ color: '#00ffcc', margin: '0 0 15px 0', borderBottom: '1px solid #00ffcc40', paddingBottom: 5 }}>
                                {editando.id ? '⚙️ Editando Forma Base' : '⚙️ Forjando Nova Forma'}
                            </h4>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                                <div>
                                    <label style={{ color: '#00ffcc', fontSize: '0.8em' }}>Nome da Forma</label>
                                    <input className="input-neon" value={editando.nome || ''} onChange={e => handleFormaChange('nome', e.target.value)} placeholder="Ex: Forma dos Pecados" style={{ width: '100%', borderColor: '#00ffcc' }} />
                                </div>
                                <div>
                                    <label style={{ color: '#00ffcc', fontSize: '0.8em' }}>Anexar Imagem da Forma</label>
                                    <input type="file" accept="image/*" onChange={handleFormaImageUpload} style={{ display: 'block', color: '#fff', fontSize: '0.8em', marginTop: '5px' }} />
                                    {editando.imagemUrl && <img src={editando.imagemUrl} alt="Preview Forma" style={{ height: '30px', marginTop: '5px', borderRadius: '4px', border: '1px solid #00ffcc' }} />}
                                </div>
                            </div>

                            <label style={{ color: '#aaa', fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}>
                                <input type="checkbox" checked={editando.acumulaFormaBase !== false} onChange={e => handleFormaChange('acumulaFormaBase', e.target.checked)} />
                                <span style={{ color: '#ffcc00' }}>Acumula com os atributos base da arma</span> (Se desmarcar, a arma perde os buffs normais enquanto transformada)
                            </label>

                            <div style={{ marginBottom: 10 }}>
                                <label style={{ color: '#00ff88', fontSize: '0.8em', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    🥋 Maestria nesta Forma (%)
                                    <input
                                        className="input-neon" type="number" min="0" max="100"
                                        value={editando.maestria ?? 0}
                                        onChange={e => { const v = parseFloat(e.target.value); handleFormaChange('maestria', isNaN(v) ? 0 : Math.min(100, Math.max(0, v))); }}
                                        style={{ width: 70, borderColor: '#00ff88', color: '#00ff88' }}
                                    />
                                </label>
                                <span style={{ color: '#666', fontSize: '0.75em' }}>Quanto maior a Maestria, menos Fadiga essa Forma gera quando ativa no Mapa. 100% = Forma dominada, sem Fadiga.</span>
                            </div>

                            <label style={{ color: '#00ffcc', fontSize: '0.8em' }}>Lore / Descrição Visual da Forma</label>
                            <textarea className="input-neon" value={editando.descricao || ''} onChange={e => handleFormaChange('descricao', e.target.value)} placeholder="Descreva como a arma muda fisicamente..." style={{ width: '100%', minHeight: '60px', marginBottom: 20, whiteSpace: 'pre-wrap' }} />

                            <h4 style={{ color: '#ffaa00', margin: '0 0 10px 0', borderBottom: '1px solid #ffaa0040', paddingBottom: 5 }}>
                                ⚙️ Configurações / Modos desta Forma
                            </h4>

                            {(editando.configs || []).map((cfg, cIdx) => {
                                if (!cfg) return null;
                                return (
                                <div key={cfg.id} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid #444', padding: 15, marginBottom: 20, borderRadius: 6 }}>
                                    
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                                        <div>
                                            <label style={{ color: '#ffaa00', fontSize: '0.8em' }}>Nome do Modo / Pecado</label>
                                            <input className="input-neon" value={cfg.nome || ''} onChange={e => handleConfigChange(cIdx, 'nome', e.target.value)} placeholder="Ex: Ganância, Tiamat Verde..." style={{ width: '100%', borderColor: '#ffaa00', color: '#ffaa00' }} />
                                        </div>
                                        <div>
                                            <label style={{ color: '#ffaa00', fontSize: '0.8em' }}>Anexar Imagem do Modo</label>
                                            <input type="file" accept="image/*" onChange={(e) => handleConfigImageUpload(cIdx, e)} style={{ display: 'block', color: '#fff', fontSize: '0.8em', marginTop: '5px' }} />
                                            {cfg.imagemUrl && <img src={cfg.imagemUrl} alt="Preview Modo" style={{ height: '30px', marginTop: '5px', borderRadius: '4px', border: '1px solid #ffaa00' }} />}
                                        </div>
                                        {(editando.configs || []).length > 1 && (
                                            <button className="btn-neon btn-red" onClick={() => removerConfig(cIdx)} style={{ padding: '0 15px', height: '36px', marginTop: '22px' }}>APAGAR MODO</button>
                                        )}
                                    </div>

                                    <label style={{ color: '#ffaa00', fontSize: '0.8em' }}>Mecânicas e Lore deste Modo</label>
                                    <textarea className="input-neon" value={cfg.descricao || ''} onChange={e => handleConfigChange(cIdx, 'descricao', e.target.value)} placeholder="O que este modo faz mecanicamente ou na história? Ex: 'Área de 4.5m reduz a movimentação...'" style={{ width: '100%', minHeight: '60px', marginBottom: 15, whiteSpace: 'pre-wrap' }} />

                                    <h6 style={{ color: '#0ff', margin: '0 0 5px 0', fontSize: '0.85em' }}>Efeitos Ativos (Motor)</h6>
                                    {/* 🔥 LAYOUT GRID ATUALIZADO: Com campo para o Nome do Efeito 🔥 */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 60px auto', gap: 6, marginBottom: 5 }}>
                                        <input className="input-neon" type="text" placeholder="Nome (Ex: Vento)" style={{ padding: 4, fontSize: '0.8em' }} value={cfg.tNomeA || ''} onChange={e => handleConfigChange(cIdx, 'tNomeA', e.target.value)} />
                                        <select className="input-neon" style={{ padding: 4, fontSize: '0.8em' }} value={cfg.tAtrA || 'forca'} onChange={e => handleConfigChange(cIdx, 'tAtrA', e.target.value)}>
                                            {ATRIBUTOS_AGRUPADOS.map(g => <optgroup key={g.label} label={g.label}>{g.options.map(a => <option key={a} value={a}>{a.replace('_', ' ').toUpperCase()}</option>)}</optgroup>)}
                                        </select>
                                        <select className="input-neon" style={{ padding: 4, fontSize: '0.8em' }} value={cfg.tPropA || 'base'} onChange={e => handleConfigChange(cIdx, 'tPropA', e.target.value)}>
                                            {PROPRIEDADE_OPTIONS.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                                        </select>
                                        <input className="input-neon" type="text" placeholder="Val" style={{ padding: 4, fontSize: '0.8em' }} value={cfg.tValA || ''} onChange={e => handleConfigChange(cIdx, 'tValA', e.target.value)} />
                                        <button className="btn-neon btn-blue" onClick={() => addEfeitoToConfig(cIdx, true)} style={{ padding: '4px 10px', margin: 0 }}>+</button>
                                    </div>
                                    {(cfg.efeitos || []).map((e, eIdx) => {
                                        if(!e) return null;
                                        return (
                                        <div key={eIdx} style={{ color: '#0ff', fontSize: '0.8em', display: 'flex', justifyContent: 'space-between', background: 'rgba(0,255,255,0.05)', padding: 4, marginBottom: 2 }}>
                                            <span>{e.nome ? `[${e.nome}] ` : ''}[{(e.atributo || '').replace('_', ' ').toUpperCase()}] {(e.propriedade || '').toUpperCase()}: {e.valor}</span>
                                            <span style={{ color: '#f00', cursor: 'pointer' }} onClick={() => removeEfeitoFromConfig(cIdx, eIdx, true)}>X</span>
                                        </div>
                                    )})}

                                    <h6 style={{ color: '#f0f', margin: '15px 0 5px 0', fontSize: '0.85em' }}>Efeitos Passivos (Motor)</h6>
                                    {/* 🔥 LAYOUT GRID ATUALIZADO 🔥 */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 60px auto', gap: 6, marginBottom: 5 }}>
                                        <input className="input-neon" type="text" placeholder="Nome (Ex: Aura)" style={{ padding: 4, fontSize: '0.8em' }} value={cfg.tNomeP || ''} onChange={e => handleConfigChange(cIdx, 'tNomeP', e.target.value)} />
                                        <select className="input-neon" style={{ padding: 4, fontSize: '0.8em' }} value={cfg.tAtrP || 'forca'} onChange={e => handleConfigChange(cIdx, 'tAtrP', e.target.value)}>
                                            {ATRIBUTOS_AGRUPADOS.map(g => <optgroup key={g.label} label={g.label}>{g.options.map(a => <option key={a} value={a}>{a.replace('_', ' ').toUpperCase()}</option>)}</optgroup>)}
                                        </select>
                                        <select className="input-neon" style={{ padding: 4, fontSize: '0.8em' }} value={cfg.tPropP || 'base'} onChange={e => handleConfigChange(cIdx, 'tPropP', e.target.value)}>
                                            {PROPRIEDADE_OPTIONS.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                                        </select>
                                        <input className="input-neon" type="text" placeholder="Val" style={{ padding: 4, fontSize: '0.8em' }} value={cfg.tValP || ''} onChange={e => handleConfigChange(cIdx, 'tValP', e.target.value)} />
                                        <button className="btn-neon" onClick={() => addEfeitoToConfig(cIdx, false)} style={{ padding: '4px 10px', margin: 0, borderColor: '#f0f', color: '#f0f' }}>+</button>
                                    </div>
                                    {(cfg.efeitosPassivos || []).map((e, eIdx) => {
                                        if(!e) return null;
                                        return (
                                        <div key={eIdx} style={{ color: '#f0f', fontSize: '0.8em', display: 'flex', justifyContent: 'space-between', background: 'rgba(255,0,255,0.05)', padding: 4, marginBottom: 2 }}>
                                            <span>{e.nome ? `[${e.nome}] ` : ''}[{(e.atributo || '').replace('_', ' ').toUpperCase()}] {(e.propriedade || '').toUpperCase()}: {e.valor}</span>
                                            <span style={{ color: '#f00', cursor: 'pointer' }} onClick={() => removeEfeitoFromConfig(cIdx, eIdx, false)}>X</span>
                                        </div>
                                    )})}
                                </div>
                            )})}

                            <button className="btn-neon btn-small" onClick={addConfig} style={{ width: '100%', borderStyle: 'dashed', borderColor: '#ffaa00', color: '#ffaa00', marginBottom: 15, padding: '10px' }}>
                                + ADICIONAR NOVA CONFIGURAÇÃO (Pecado, Elemento, Estágio...)
                            </button>

                            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                                <button className="btn-neon btn-gold" onClick={salvar} style={{ flex: 1, padding: '10px', fontSize: '1.1em' }}>SALVAR FORMA NO COMPÊNDIO</button>
                                <button className="btn-neon btn-red" onClick={cancelarEdicao} style={{ flex: 1, padding: '10px', fontSize: '1.1em' }}>CANCELAR</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}