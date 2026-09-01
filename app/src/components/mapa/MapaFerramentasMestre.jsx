import React, { useState, useMemo } from 'react';
import { useMapaForm } from './MapaFormContext';
import { salvarDummie } from '../../services/firebase-sync';

const FALLBACK = <div style={{ color: '#888', padding: 10 }}>Mapa provider não encontrado</div>;

export function MapaFerramentasMestre() {
    const ctx = useMapaForm();
    if (!ctx) return FALLBACK;
    
    const { isMestre, isModoRP, mestreVendoRP } = ctx;
    const [abaMestre, setAbaMestre] = useState('');

    if (!isMestre) return null;

    return (
        <div className="fade-in" style={{ marginBottom: 15, background: 'rgba(0,0,0,0.4)', borderRadius: 5, border: '1px solid #333', overflow: 'hidden' }}>
            <MapaMestreRPToggle />
            
            {(!isModoRP || mestreVendoRP) && (
                <div style={{ padding: '10px 15px' }}>
                    <MapaMestreCenaVisualizada />
                    
                    <div style={{ display: 'flex', gap: 5, marginBottom: abaMestre ? 15 : 0, overflowX: 'auto', paddingBottom: 5 }}>
                        <button className={`btn-neon ${abaMestre === 'cenas' ? 'btn-gold' : ''}`} onClick={() => setAbaMestre(a => a === 'cenas' ? '' : 'cenas')} style={{ padding: '4px 10px', fontSize: '0.85em', margin: 0, flex: 1, whiteSpace: 'nowrap' }}>🎬 Cenas</button>
                        <button className={`btn-neon ${abaMestre === 'tokens' ? 'btn-gold' : ''}`} onClick={() => setAbaMestre(a => a === 'tokens' ? '' : 'tokens')} style={{ padding: '4px 10px', fontSize: '0.85em', margin: 0, flex: 1, whiteSpace: 'nowrap' }}>📦 Gaveta</button>
                        <button className={`btn-neon ${abaMestre === 'dummies' ? 'btn-gold' : ''}`} onClick={() => setAbaMestre(a => a === 'dummies' ? '' : 'dummies')} style={{ padding: '4px 10px', fontSize: '0.85em', margin: 0, flex: 1, whiteSpace: 'nowrap' }}>🤖 Entidades</button>
                        <button className={`btn-neon ${abaMestre === 'zonas' ? 'btn-gold' : ''}`} onClick={() => setAbaMestre(a => a === 'zonas' ? '' : 'zonas')} style={{ padding: '4px 10px', fontSize: '0.85em', margin: 0, flex: 1, whiteSpace: 'nowrap' }}>🌪️ Zonas</button>
                        <button className={`btn-neon ${abaMestre === 'dano' ? 'btn-gold' : ''}`} onClick={() => setAbaMestre(a => a === 'dano' ? '' : 'dano')} style={{ padding: '4px 10px', fontSize: '0.85em', margin: 0, flex: 1, whiteSpace: 'nowrap' }}>⚔️ Dano</button>
                    </div>

                    {abaMestre === 'cenas' && <MapaMestreGerenciadorCenas />}
                    {abaMestre === 'tokens' && <MapaMestreGavetaTokens />}
                    {abaMestre === 'dummies' && <MapaMestreGeradorDummies />}
                    {abaMestre === 'zonas' && <MapaMestreGerenciadorZonas />}
                    {abaMestre === 'dano' && <MapaMestreDanoRapido />}
                </div>
            )}
        </div>
    );
}

export function MapaMestreRPToggle() {
    const ctx = useMapaForm();
    if (!ctx) return FALLBACK;
    const { isMestre, isModoRP, mestreVendoRP, setMestreVendoRP, toggleModoRP } = ctx;
    
    if (!isMestre) return null;
    
    return (
        <div style={{ background: isModoRP ? 'rgba(255, 0, 255, 0.15)' : 'rgba(0, 255, 136, 0.15)', padding: '8px 15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ color: isModoRP ? '#ff00ff' : '#00ff88', fontWeight: 'bold', fontSize: '0.9em' }}>
                {isModoRP ? '🍻 MODO TAVERNA (Oculto dos Jogadores)' : '🌍 MODO COMBATE (Mapa Visível)'}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
                {isModoRP && (
                    <button className={`btn-neon ${mestreVendoRP ? 'btn-blue' : 'btn-gold'}`} onClick={() => setMestreVendoRP(!mestreVendoRP)} style={{ padding: '2px 10px', fontSize: '0.8em', margin: 0 }}>
                        {mestreVendoRP ? '🗺️ OCULTAR MAPA' : '👁️ ESPIAR COMBATE'}
                    </button>
                )}
                <button className={`btn-neon ${isModoRP ? 'btn-green' : 'btn-purple'}`} onClick={toggleModoRP} style={{ padding: '2px 10px', fontSize: '0.8em', margin: 0 }}>
                    {isModoRP ? '🌍 REVELAR MAPA PARA TODOS' : '🍻 ENVIAR TODOS PARA TAVERNA'}
                </button>
            </div>
        </div>
    );
}

export function MapaMestreCenaVisualizada() {
    const ctx = useMapaForm();
    if (!ctx) return FALLBACK;
    const { isMestre, cenaVisualizadaId, cenaAtivaIdGlobal, cenaAtual, cenaRenderId, ativarCena } = ctx;
    if (!isMestre || !cenaVisualizadaId || cenaVisualizadaId === cenaAtivaIdGlobal) return null;
    return (
        <div style={{ background: 'rgba(0, 136, 255, 0.2)', border: '2px dashed #0088ff', padding: '10px 15px', borderRadius: '5px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ color: '#0088ff', fontWeight: 'bold', fontSize: '1.1em' }}>👁️ MODO EDIÇÃO OCULTA: Apenas você vê a cena "{cenaAtual.nome}".</span>
            <button className="btn-neon btn-green" onClick={() => ativarCena(cenaRenderId)} style={{ padding: '5px 15px', margin: 0 }}>
                🌍 PUBLICAR ESTA CENA PARA TODOS
            </button>
        </div>
    );
}

export function MapaMestreGerenciadorCenas() {
    const ctx = useMapaForm();
    if (!ctx) return FALLBACK;
    const { isMestre, souCriador, isModoRP, mestreVendoRP, cenario, cenaAtivaIdGlobal, cenaRenderId, setCenaVisualizadaId, ativarCena, deletarCena, novaCenaNome, setNovaCenaNome, novaCenaEscala, setNovaCenaEscala, novaCenaUnidade, setNovaCenaUnidade, novaCenaApenasCriador, setNovaCenaApenasCriador, uploadingMap, handleUploadNovaCena } = ctx;
    if (!isMestre || (isModoRP && !mestreVendoRP)) return null;
    // 🔥 Cena marcada "apenasCriador" só existe pro Mestre Supremo enquanto não for publicada pra
    // mesa toda — Co-Mestres nem sabem que ela existe até o Criador dar "Publicar para Todos"
    // (a partir daí ela é a Cena ativa de todo mundo, então volta a aparecer normalmente).
    const cenasVisiveis = Object.entries(cenario?.lista || {}).filter(([id, cena]) => !cena.apenasCriador || souCriador || cenaAtivaIdGlobal === id);
    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 15, background: 'rgba(0,0,0,0.5)', padding: 15, borderRadius: 5, border: '1px solid #ffcc00' }}>
            <h3 style={{ color: '#ffcc00', margin: 0 }}>🎬 Gerenciador de Cenas</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', background: '#0a0a0a', padding: 10, borderRadius: 5 }}>
                {cenasVisiveis.map(([id, cena]) => {
                    const isAtivaGlobal = cenaAtivaIdGlobal === id;
                    const isVisualizada = cenaRenderId === id;
                    return (
                        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: isAtivaGlobal ? 'rgba(0, 255, 136, 0.2)' : isVisualizada ? 'rgba(0, 136, 255, 0.2)' : '#222', border: `1px solid ${isAtivaGlobal ? '#00ff88' : isVisualizada ? '#0088ff' : '#555'}`, padding: '5px 10px', borderRadius: 4, flexWrap: 'wrap' }}>
                            {cena.apenasCriador && <span title="Só o Mestre Supremo vê esta Cena" style={{ fontSize: '0.9em' }}>🔒</span>}
                            <span style={{ color: isAtivaGlobal ? '#00ff88' : isVisualizada ? '#0088ff' : '#fff', fontWeight: 'bold' }}>{cena.nome}</span>
                            {isAtivaGlobal && <span style={{ fontSize: '0.6em', background: '#00ff88', color: '#000', padding: '2px 4px', borderRadius: 3, fontWeight: 'bold', marginLeft: 4 }}>🌍 PUBLICA</span>}
                            {isVisualizada && !isAtivaGlobal && <span style={{ fontSize: '0.6em', background: '#0088ff', color: '#fff', padding: '2px 4px', borderRadius: 3, fontWeight: 'bold', marginLeft: 4 }}>👁️ VENDO</span>}
                            {!isVisualizada && <button className="btn-neon btn-blue btn-small" onClick={() => setCenaVisualizadaId(id)} style={{ padding: '2px 8px', fontSize: '0.8em', margin: '0 0 0 5px' }}>Ver Cena Oculta</button>}
                            {!isAtivaGlobal && <button className="btn-neon btn-green btn-small" onClick={() => ativarCena(id)} style={{ padding: '2px 8px', fontSize: '0.8em', margin: '0 0 0 5px' }}>Publicar para Todos</button>}
                            <button className="btn-neon btn-red btn-small" onClick={() => deletarCena(id)} style={{ padding: '2px 8px', fontSize: '0.8em', margin: 0 }}>X</button>
                        </div>
                    );
                })}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid #444', paddingTop: 10 }}>
                <span style={{ color: '#ffcc00', fontWeight: 'bold' }}>Nova Cena:</span>
                <input className="input-neon" type="text" placeholder="Nome (Ex: Taverna)" value={novaCenaNome} onChange={e => setNovaCenaNome(e.target.value)} style={{ width: 150, padding: 5 }}/>
                <label className="btn-neon btn-blue" style={{ cursor: 'pointer', padding: '5px 15px', margin: 0, opacity: uploadingMap ? 0.5 : 1 }}>
                    {uploadingMap ? 'Enviando...' : '📁 Anexar Fundo'}
                    <input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleUploadNovaCena} style={{ display: 'none' }} disabled={uploadingMap} />
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#111', padding: '3px 8px', borderRadius: 5, border: '1px solid #444' }}>
                    <span style={{ color: '#aaa', fontSize: '0.8em' }}>Escala:</span>
                    <input className="input-neon" type="number" min="0.1" step="0.1" value={novaCenaEscala} onChange={e => setNovaCenaEscala(e.target.value)} style={{ width: 60, padding: 4, margin: 0 }} />
                    <select className="input-neon" value={novaCenaUnidade} onChange={e => setNovaCenaUnidade(e.target.value)} style={{ padding: 4, margin: 0 }}>
                        <option value="m">m</option><option value="km">km</option><option value="milhas">mi</option><option value="anos-luz">Ly</option>
                    </select>
                </div>
                {souCriador && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#ffcc00', fontSize: '0.8em', cursor: 'pointer' }} title="Nem os Co-Mestres verão esta Cena até você dar Publicar para Todos">
                        <input type="checkbox" checked={novaCenaApenasCriador} onChange={e => setNovaCenaApenasCriador(e.target.checked)} /> 🔒 Só eu vejo
                    </label>
                )}
            </div>
        </div>
    );
}

export function MapaMestreGavetaTokens() {
    return (
        <div className="fade-in" style={{ background: 'rgba(0,0,0,0.5)', padding: 15, borderRadius: 5, border: '1px solid #00ff88' }}>
            <h3 style={{ color: '#00ff88', margin: 0 }}>📦 Gaveta de Tokens</h3>
            <p style={{ color: '#888', fontStyle: 'italic' }}>Componente da Gaveta preservado. Pronto para futuras atualizações!</p>
        </div>
    );
}

export function MapaMestreGeradorDummies() {
    const ctx = useMapaForm();
    if (!ctx) return FALLBACK;
    const { isMestre, isModoRP, mestreVendoRP, cenaRenderId } = ctx;
    if (!isMestre || (isModoRP && !mestreVendoRP)) return null;
    return (
        <div className="fade-in" style={{ padding: 10, border: '1px solid #0088ff', borderRadius: 5, background: 'rgba(0, 136, 255, 0.1)' }}>
            <h3 style={{ color: '#0088ff', marginTop: 0, marginBottom: 10 }}>🤖 Gerador de Entidades (Nesta Cena)</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input className="input-neon" type="text" placeholder="Nome" id="dummieNome" defaultValue="Boneco" style={{ width: 100, padding: 5 }}/>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#111', padding: '3px 8px', borderRadius: 5, border: '1px solid #444' }}>
                    <span style={{ color: '#aaa', fontSize: '0.8em' }}>HP Base:</span>
                    <input className="input-neon" type="number" id="dummieHp" defaultValue="100" style={{ width: 60, padding: 4, margin: 0 }} />
                    <span style={{ color: '#0f0', fontSize: '0.8em', fontWeight: 'bold' }}>+Vit:</span>
                    <input className="input-neon" type="number" id="dummieVitalidade" defaultValue="0" min="0" max="15" style={{ width: 45, padding: 4, margin: 0, borderColor: '#0f0', color: '#0f0' }} title="Ex: Vit 3 = adiciona 3 zeros" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#111', padding: '3px 8px', borderRadius: 5, border: '1px solid #444' }}>
                    <select className="input-neon" id="dummieDefTipo" style={{ width: 90, padding: 4, margin: 0 }}>
                        <option value="evasiva">Evasiva</option><option value="resistencia">Resistência</option>
                    </select>
                    <span style={{ color: '#0088ff', fontSize: '0.8em', fontWeight: 'bold' }}>CA:</span>
                    <input className="input-neon" type="number" id="dummieDef" defaultValue="10" style={{ width: 50, padding: 4, margin: 0 }} title="Classe de Armadura (5 + Base)"/>
                </div>
                <select className="input-neon" id="dummieVisivel" style={{ width: 110, padding: 5 }} title="Visibilidade do HP">
                    <option value="todos">HP Visível</option><option value="mestre">HP Oculto</option>
                </select>
                <button className="btn-neon btn-blue" onClick={() => {
                    const n = document.getElementById('dummieNome').value || 'Entidade';
                    const hBase = parseInt(document.getElementById('dummieHp').value) || 100;
                    const vit = parseInt(document.getElementById('dummieVitalidade').value) || 0;
                    const h = hBase * Math.pow(10, vit);
                    const dt = document.getElementById('dummieDefTipo').value;
                    const dv = parseInt(document.getElementById('dummieDef').value) || 10;
                    const vHp = document.getElementById('dummieVisivel').value;
                    const id = 'dummie_' + Date.now();
                    salvarDummie(id, { nome: n, hpMax: h, hpAtual: h, tipoDefesa: dt, valorDefesa: dv, visibilidadeHp: vHp, cenaId: cenaRenderId, posicao: { x: 0, y: 0 } });
                }} style={{ padding: '5px 15px', margin: 0 }}>+ Injetar na Cena</button>
            </div>
        </div>
    );
}

export function MapaMestreDanoRapido() {
    const ctx = useMapaForm();
    if (!ctx) return FALLBACK;
    const { isMestre, isModoRP, mestreVendoRP, jogadores, dummies, cenaRenderId, aplicarDanoRapido } = ctx;
    const [alvoId, setAlvoId] = useState('');
    const [valorDano, setValorDano] = useState(10);
    if (!isMestre || (isModoRP && !mestreVendoRP)) return null;

    // Mesmo filtro-por-cena de MapaIniciativaTracker (todasEntidades) — só mostra quem está
    // presente na cena que o Mestre está vendo agora, senão a lista ficaria cheia de gente/
    // entidades de outras cenas/mesas antigas.
    const alvos = useMemo(() => {
        const estaNaCena = (f) => {
            const pos = f.posicoes ? f.posicoes[cenaRenderId] : null;
            if (pos) return true;
            return !!(f.posicao && (f.posicao.cenaId || 'default') === cenaRenderId);
        };
        const js = Object.entries(jogadores || {}).filter(([n, f]) => estaNaCena(f)).map(([n, f]) => ({ id: n, nome: n, ficha: f, isDummie: false }));
        const ds = Object.entries(dummies || {}).filter(([id, d]) => (d.cenaId || 'default') === cenaRenderId).map(([id, d]) => ({ id, nome: d.nome, ficha: d, isDummie: true }));
        return [...js, ...ds];
    }, [jogadores, dummies, cenaRenderId]);

    const alvoAtual = alvos.find(a => a.id === alvoId) || null;

    const aplicar = () => {
        if (!alvoAtual) return alert('Escolha um alvo primeiro.');
        aplicarDanoRapido(alvoAtual, valorDano);
    };

    return (
        <div className="fade-in" style={{ background: 'rgba(255, 0, 60, 0.1)', padding: 15, borderRadius: 5, border: '1px solid #ff003c' }}>
            <h3 style={{ color: '#ff003c', margin: 0 }}>⚔️ Dano Rápido</h3>
            <p style={{ color: '#888', fontStyle: 'italic', margin: '5px 0 15px', fontSize: '0.85em' }}>Aplica dano direto na Vida de um jogador ou entidade nesta cena, sem precisar que o alvo digite nada.</p>
            {alvos.length === 0 ? (
                <p style={{ color: '#888', fontSize: '0.85em' }}>Nenhum jogador ou entidade nesta cena.</p>
            ) : (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select className="input-neon" value={alvoId} onChange={e => setAlvoId(e.target.value)} style={{ padding: 5, minWidth: 140 }}>
                        <option value="">Escolha o alvo...</option>
                        {alvos.map(a => <option key={a.id} value={a.id}>{a.isDummie ? '🤖 ' : '🧑 '}{a.nome}</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#111', padding: '3px 8px', borderRadius: 5, border: '1px solid #444' }}>
                        <span style={{ color: '#ff003c', fontSize: '0.8em', fontWeight: 'bold' }}>Dano:</span>
                        <input className="input-neon" type="number" min="1" value={valorDano} onChange={e => setValorDano(e.target.value)} style={{ width: 80, padding: 4, margin: 0 }} />
                    </div>
                    <button className="btn-neon btn-red" onClick={aplicar} disabled={!alvoAtual} style={{ padding: '5px 15px', margin: 0, opacity: alvoAtual ? 1 : 0.5 }}>💥 Aplicar Dano</button>
                </div>
            )}
        </div>
    );
}

export function MapaMestreGerenciadorZonas() {
    const ctx = useMapaForm();
    if (!ctx) return FALLBACK;
    const { isMestre, isModoRP, mestreVendoRP, cenario, deletarZona } = ctx;
    if (!isMestre || (isModoRP && !mestreVendoRP)) return null;

    const zonas = cenario?.zonas || [];
    if (zonas.length === 0) return (
        <div className="fade-in" style={{ background: 'rgba(255, 0, 100, 0.1)', padding: 15, borderRadius: 5, border: '1px solid #ff00ff' }}>
            <h3 style={{ color: '#ff00ff', margin: 0 }}>🌪️ Zonas e Anomalias</h3>
            <p style={{ color: '#888', fontStyle: 'italic', margin: '5px 0 0' }}>O mapa está limpo. Nenhuma zona ativa.</p>
        </div>
    );

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(255, 0, 100, 0.1)', padding: 15, borderRadius: 5, border: '1px solid #ff00ff' }}>
            <h3 style={{ color: '#ff00ff', margin: 0 }}>🌪️ Zonas e Anomalias no Campo</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {zonas.map(z => (
                    <div key={z.id} style={{ background: 'rgba(0,0,0,0.6)', border: `1px solid rgba(${z.rgb}, 0.8)`, padding: '5px 10px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: `rgb(${z.rgb})`, fontWeight: 'bold', fontSize: '0.85em' }}>{z.nome} (Raio {z.raio}Q | {z.duracao}T)</span>
                        <button className="btn-neon btn-red btn-small" onClick={() => deletarZona(z.id)} style={{ padding: '2px 8px', fontSize: '0.8em', margin: 0 }}>Dissipar</button>
                    </div>
                ))}
            </div>
        </div>
    );
}