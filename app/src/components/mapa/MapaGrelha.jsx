import React, { useContext } from 'react';
import { useMapaForm, urlSeguraParaCss, MAP_SIZE } from './MapaFormContext';
import Tabuleiro3D from './Tabuleiro3D';
import DummieToken from '../combat/DummieToken';
import MapaMundi from './MapaMundi';
import { MapaSessaoRP } from './MapaVoz';

// 🔥 NOVO: CONSUMINDO A VOZ GLOBAL DO APP 🔥
import { VoiceContext } from '../../App'; 

const FALLBACK = <div style={{ color: '#888', padding: 10 }}>Mapa provider não encontrado</div>;

export function MapaAreaCentral() {
    const ctx = useMapaForm();
    const chatCtx = useContext(VoiceContext); // <-- Lendo a Voz Imortal!
    
    if (!ctx) return FALLBACK;
    const { isModoRP, isMestre, mestreVendoRP, meuNome, cenario, isPresenteNaTaverna, minhaFicha, personagens, togglePresencaTaverna, getAvatarInfo, fmt } = ctx;

    if (isModoRP && (!isMestre || mestreVendoRP)) {
        return <MapaSessaoRP 
            chatCtx={chatCtx} meuNome={meuNome} minhaFicha={minhaFicha} personagens={personagens} 
            cenario={cenario} isPresenteNaTaverna={isPresenteNaTaverna} togglePresencaTaverna={togglePresencaTaverna} 
            getAvatarInfo={getAvatarInfo} fmt={fmt} 
        />;
    }
    
    return (
        <MapaMundi>
            <MapaControlesSuperiores />
            <MapaVisao />
        </MapaMundi>
    );
}

export function MapaControlesSuperiores() {
    const ctx = useMapaForm();
    if (!ctx) return FALLBACK;
    
    const {
        modo3D, setModo3D, alterarZoom, tamanhoCelula, isMestre, souCriador,
        cenaVisualizadaId, cenaAtivaIdGlobal, cenaAtual,
        altitudeInput, setAltitudeInput, cenario, ativarCena
    } = ctx;
    
    return (
        <div style={{ display: 'flex', gap: 15, marginBottom: 10, alignItems: 'center', background: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.85em', flexWrap: 'wrap', position: 'relative', zIndex: 100 }}>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', opacity: modo3D ? 0.3 : 1 }}>
                <button className="btn-neon" onClick={() => alterarZoom(-1)} style={{ padding: '2px 8px', margin: 0 }} disabled={modo3D}>-</button>
                <span style={{ color: '#aaa', minWidth: '80px', textAlign: 'center' }}>Zoom: {tamanhoCelula}px</span>
                <button className="btn-neon" onClick={() => alterarZoom(1)} style={{ padding: '2px 8px', margin: 0 }} disabled={modo3D}>+</button>
            </div>
            
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderLeft: '1px solid #444', paddingLeft: 15 }}>
                <span style={{ color: isMestre && cenaVisualizadaId && cenaVisualizadaId !== cenaAtivaIdGlobal ? '#0088ff' : '#ffcc00', fontWeight: 'bold' }}>
                    {isMestre && cenaVisualizadaId && cenaVisualizadaId !== cenaAtivaIdGlobal ? '👁️ Previsão:' : 'Cena:'}
                </span>
                
                {isMestre ? (
                    <select 
                        className="input-neon" 
                        value={cenaAtivaIdGlobal} 
                        onChange={(e) => ativarCena(e.target.value)}
                        style={{ padding: '2px 5px', height: '26px', margin: 0, borderColor: '#ffcc00', color: '#ffcc00', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        {Object.entries(cenario?.lista || {}).filter(([id, c]) => !c.apenasCriador || souCriador || cenaAtivaIdGlobal === id).map(([id, c]) => (
                            <option key={id} value={id}>{c.nome}</option>
                        ))}
                    </select>
                ) : (
                    <span style={{ color: '#fff', fontWeight: 'bold' }}>{cenaAtual.nome}</span>
                )}
                
                <span style={{color: '#888', fontWeight: 'normal'}}>(1Q = {cenaAtual.escala}{cenaAtual.unidade})</span>
                
                {isMestre && (
                    <span style={{ color: '#00ccff', fontStyle: 'italic', marginLeft: '5px', fontSize: '0.85em' }}>
                        (Abra a aba 🎬 Cenas acima para criar novas)
                    </span>
                )}
            </div>

            <div style={{ display: 'flex', gap: 5, alignItems: 'center', borderLeft: '1px solid #444', paddingLeft: 15, marginLeft: 'auto' }}>
                <span style={{ color: '#00ccff', fontWeight: 'bold' }}>Z:</span>
                <input className="input-neon" type="number" value={altitudeInput} onChange={e => setAltitudeInput(e.target.value)} style={{ width: 50, padding: 2, height: 24, borderColor: '#00ccff', color: '#fff', margin: 0 }} title="Altitude" />
                <span style={{ color: '#888' }}>m</span>
            </div>
            <button className={`btn-neon ${modo3D ? 'btn-gold' : ''}`} onClick={() => setModo3D(!modo3D)} style={{ padding: '2px 10px', margin: 0, borderColor: modo3D ? '#ffcc00' : '#00ffcc' }}>
                {modo3D ? '🌌 2D' : '🌌 3D'}
            </button>
        </div>
    );
}

export function MapaVisao() {
    const ctx = useMapaForm();
    if (!ctx) return FALLBACK;
    const {
        modo3D, tamanhoCelula, cenaAtual, cells, tokenMap, dummyMap,
        cenaRenderId, tokens3D, handleCellClick, getAvatarInfo,
        meuNome, corDoJogador, overridesCompendio, cenario, isMestre
    } = ctx;

    const zonasCena = (cenario?.zonas || []).filter(z => (z.cenaId || 'default') === cenaRenderId);

    if (modo3D) {
        return (
            <div className="fade-in" style={{ height: '60vh', background: '#000', borderRadius: 5, overflow: 'hidden', border: '2px solid #0088ff', boxShadow: '0 0 20px rgba(0, 136, 255, 0.4)' }}>
                <Tabuleiro3D mapSize={MAP_SIZE} tokens={tokens3D} moverJogador={handleCellClick} mapUrl={cenaAtual.img} />
            </div>
        );
    }

    return (
        <div id="combat-grid" className="fade-in" style={{
            display: 'grid', gridTemplateColumns: `repeat(${MAP_SIZE}, ${tamanhoCelula}px)`, gap: 1,
            overflow: 'auto', maxHeight: '60vh', background: 'rgba(0,0,0,0.3)', padding: 5, borderRadius: 5,
            backgroundImage: urlSeguraParaCss(cenaAtual.img), 
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            position: 'relative'
        }}>
            {zonasCena.map(z => (
                <div key={z.id} style={{
                    position: 'absolute', pointerEvents: 'none', zIndex: 3,
                    left: (z.x - z.raio) * tamanhoCelula,
                    top: (z.y - z.raio) * tamanhoCelula,
                    width: (z.raio * 2 + 1) * tamanhoCelula + (z.raio * 2), 
                    height: (z.raio * 2 + 1) * tamanhoCelula + (z.raio * 2),
                    background: `rgba(${z.rgb || '255,0,0'}, 0.2)`,
                    border: `3px dashed rgba(${z.rgb || '255,0,0'}, 0.9)`,
                    boxShadow: `inset 0 0 20px rgba(${z.rgb}, 0.5)`,
                    borderRadius: '8px',
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'center'
                }}>
                    <span style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '0.7em', padding: '2px 8px', borderRadius: '0 0 8px 8px', borderBottom: `1px solid rgba(${z.rgb}, 0.8)`, borderLeft: `1px solid rgba(${z.rgb}, 0.8)`, borderRight: `1px solid rgba(${z.rgb}, 0.8)`, fontWeight: 'bold' }}>
                        {z.nome}
                    </span>
                </div>
            ))}

            {cells.map((cell) => {
                const key = `${cell.x},${cell.y}`;
                const tokensNestaCelula = tokenMap[key] || [];
                const visivelTokens = tokensNestaCelula.filter(tk => isMestre || !(cenario?.tokensOcultos?.includes(tk.nome)));

                const cellDummies = (dummyMap[key] || []).filter(([id]) => {
                    const isOculto = cenario?.tokensOcultos?.includes(id);
                    return isMestre || !isOculto;
                });

                return (
                    <div key={key} className="map-cell" data-x={cell.x} data-y={cell.y} onClick={() => handleCellClick(cell.x, cell.y)} style={{ width: tamanhoCelula, height: tamanhoCelula, border: '1px solid rgba(255,255,255,0.1)', position: 'relative', cursor: 'pointer' }}>
                        
                        {cellDummies.map(([id, d]) => (
                            <div key={id} style={{ opacity: cenario?.tokensOcultos?.includes(id) ? 0.4 : 1 }}>
                                <DummieToken id={id} dummie={d} />
                            </div>
                        ))}
                        
                        {visivelTokens.map((tk) => {
                            const info = getAvatarInfo(tk.ficha);
                            const isMe = tk.nome === meuNome;
                            const isOculto = cenario?.tokensOcultos?.includes(tk.nome);
                            
                            const posLocal = tk.ficha?.posicoes?.[cenaRenderId] || tk.ficha?.posicao;
                            const altitude = posLocal?.z || 0;
                            const isFlying = altitude > 0;
                            
                            const tkMesa = tk.ficha?.bio?.mesa || 'presente';
                            let tkClass = tk.ficha?.bio?.classe;
                            if ((tkClass === 'pretender' || tkClass === 'alterego') && tk.ficha?.bio?.subClasse) tkClass = tk.ficha?.bio?.subClasse;
                            const tkGrand = tkClass && overridesCompendio?.grands?.[`${tkClass}_${tkMesa}`] === tk.nome;
                            const tkCand = tkClass && !tkGrand && (overridesCompendio?.grands?.[`${tkClass}_${tkMesa}_candidatos`] || []).includes(tk.nome);
                            
                            let bordaToken = isFlying ? '3px solid #00ccff' : (isMe ? '2px solid #00ffcc' : '1px solid rgba(255,255,255,0.3)');
                            let sombraToken = isFlying ? '0 10px 15px rgba(0, 204, 255, 0.5)' : 'none';
                            if (tkGrand) { bordaToken = '3px solid #ffcc00'; sombraToken = '0 0 15px #ff003c, inset 0 0 10px #ffcc00'; } 
                            else if (tkCand) { bordaToken = '2px solid #0088ff'; sombraToken = '0 0 10px #00ccff'; }

                            const style = {
                                position: 'absolute', top: 2, left: 2, width: tamanhoCelula - 4, height: tamanhoCelula - 4,
                                borderRadius: '50%', backgroundColor: corDoJogador(tk.nome), display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: '0.7em', fontWeight: 'bold', border: bordaToken, boxShadow: sombraToken,
                                transform: isFlying ? 'translateY(-5px)' : 'none', backgroundImage: urlSeguraParaCss(info.img) || 'none', backgroundSize: 'cover', backgroundPosition: 'center',
                                zIndex: isFlying ? 10 : (tkGrand ? 5 : 1),
                                opacity: isOculto ? 0.4 : 1 
                            };
                            return (
                                <div key={tk.nome} className={`player-token${isMe ? ' my-token' : ''}`} title={`${tk.nome} | Altura: ${altitude}m`} style={style}>
                                    {!info.img && tk.nome.charAt(0).toUpperCase()}
                                    {isFlying && <div style={{ position: 'absolute', bottom: '-15px', background: '#00ccff', color: '#000', fontSize: '0.8em', padding: '0 4px', borderRadius: '4px', fontWeight: 'bold' }}>{altitude}m</div>}
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}