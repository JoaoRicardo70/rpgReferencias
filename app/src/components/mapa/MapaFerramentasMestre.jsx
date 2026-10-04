import React, { useState, useMemo, useCallback } from 'react';
import useStore from '../../stores/useStore';
import { useMapaForm } from './MapaFormContext';
import { calcularDisputaPoder, getPoderDeEntidade, formatarPoderDisputa } from '../../core/disputaPoder';
import { getPontosVidaTotal } from '../../core/danoProporcional';
import { agruparNpcsPorFamilia, montarDummieDeNpc, posicoesLivres, getVidaMaxBrutaNpc, cenarioComTokensOcultos } from '../../core/gavetaNpc';
import DisputaPoderResumo from '../combate/DisputaPoderResumo';
import { salvarDummie, salvarCenarioCompleto } from '../../services/firebase-sync';
import { ELEMENTOS_OPCOES } from '../poderes/PoderesSubComponents';
import { FATOR_EXIBICAO_VITAIS } from '../../core/vitals';

const FALLBACK = <div style={{ color: '#888', padding: 10 }}>Mapa provider não encontrado</div>;

export function MapaFerramentasMestre() {
    const ctx = useMapaForm();
    const [abaMestre, setAbaMestre] = useState('');
    if (!ctx) return FALLBACK;

    const { isMestre, isModoRP, mestreVendoRP } = ctx;

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

// Uma linha da Gaveta: Vida e Poder (cálculos pesados) só recalculam quando a ficha muda.
const GavetaNpcLinha = React.memo(function GavetaNpcLinha({ nome, ficha, divisorPoderMesa, naCena, onColocar }) {
    const vida = useMemo(() => getVidaMaxBrutaNpc(ficha) / FATOR_EXIBICAO_VITAIS, [ficha]);
    const poder = useMemo(() => getPoderDeEntidade({ ficha, isDummie: false }, divisorPoderMesa), [ficha, divisorPoderMesa]);
    const colocar = useCallback(() => onColocar(nome, ficha), [onColocar, nome, ficha]);
    return (
        <div className="gaveta-npc">
            <div className="gaveta-npc-info">
                <strong>{nome}</strong>
                <span>❤️ {Math.round(vida).toLocaleString('pt-BR')} · ⚡ {formatarPoderDisputa(poder)}{naCena ? ` · ${naCena} na cena` : ''}</span>
            </div>
            <button type="button" className="btn-neon btn-green gaveta-npc-btn" onClick={colocar}>⚔️ Ao combate</button>
        </div>
    );
});

// 📦 Gaveta de Tokens: os NPCs da mesa (os mesmos do Visor de Entidades > NPCs da aba Mestre)
// entram em combate nesta cena como tokens de entidade, com Vida, Defesa e Poder da própria ficha
// (core/gavetaNpc.js). Depois é só colocar na ordem de turno pelo painel de Iniciativa.
export function MapaMestreGavetaTokens() {
    const ctx = useMapaForm();
    const { isMestre, isModoRP, mestreVendoRP, jogadores, dummies, cenaRenderId } = ctx || {};
    const divisorPoderMesa = useStore(s => s.divisorPoderMesa);
    const [busca, setBusca] = useState('');
    const [quantidade, setQuantidade] = useState(1);
    const [oculto, setOculto] = useState(false);
    const [visibilidadeHp, setVisibilidadeHp] = useState('todos');
    const [aberta, setAberta] = useState({});

    const grupos = useMemo(() => agruparNpcsPorFamilia(jogadores, busca), [jogadores, busca]);
    const familias = useMemo(() => Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'pt-BR')), [grupos]);
    const naCena = useMemo(() => {
        const contagem = {};
        Object.values(dummies || {}).forEach(d => {
            if (d && d.fichaOrigem && (d.cenaId || 'default') === cenaRenderId) contagem[d.fichaOrigem] = (contagem[d.fichaOrigem] || 0) + 1;
        });
        return contagem;
    }, [dummies, cenaRenderId]);
    // Maior "#n" já usado por cada NPC (em qualquer cena): a próxima cópia continua dali, mesmo
    // que uma do meio tenha sido removida — dois tokens nunca ficam com o mesmo nome.
    const maiorNumero = useMemo(() => {
        const maior = {};
        Object.values(dummies || {}).forEach(d => {
            if (!d || !d.fichaOrigem) return;
            const m = String(d.nome || '').match(/#(\d+)$/);
            const n = m ? parseInt(m[1], 10) : 0;
            if (n > (maior[d.fichaOrigem] || 0)) maior[d.fichaOrigem] = n;
        });
        return maior;
    }, [dummies]);

    const alternarFamilia = useCallback((familia) => setAberta(prev => ({ ...prev, [familia]: !prev[familia] })), []);

    const colocarEmCombate = useCallback((nome, ficha) => {
        const qtd = Math.min(10, Math.max(1, parseInt(quantidade, 10) || 1));
        // Casas já ocupadas nesta cena (entidades e personagens), pra não empilhar tokens.
        const ocupadas = [
            ...Object.values(dummies || {}).filter(d => d && (d.cenaId || 'default') === cenaRenderId).map(d => d.posicao),
            ...Object.values(jogadores || {}).map(f => f?.posicoes?.[cenaRenderId]),
        ];
        const livres = posicoesLivres(ocupadas, qtd);
        const ultimoNumero = maiorNumero[nome] || 0;
        const base = Date.now();
        const ids = [];
        for (let i = 0; i < qtd; i++) {
            const id = `dummie_${base}_${i}`;
            ids.push(id);
            salvarDummie(id, montarDummieDeNpc(nome, ficha, { divisorPoderMesa, cenaId: cenaRenderId, posicao: livres[i], visibilidadeHp, numero: ultimoNumero + i + 1 }));
        }
        // Invisível de verdade: o Mapa esconde pelos ids em cenario.tokensOcultos.
        if (oculto) salvarCenarioCompleto(cenarioComTokensOcultos(useStore.getState().cenario, ids));
    }, [quantidade, dummies, jogadores, cenaRenderId, maiorNumero, divisorPoderMesa, oculto, visibilidadeHp]);

    if (!ctx) return FALLBACK;
    if (!isMestre || (isModoRP && !mestreVendoRP)) return null;

    return (
        <div className="fade-in gaveta-tokens">
            <h3 className="gaveta-titulo">📦 Gaveta de Tokens</h3>
            <p className="gaveta-explica">Seus NPCs (os do Visor de Entidades da aba Mestre) entram nesta cena como tokens de combate, com a Vida cheia, a Defesa e o Poder Calculado da ficha. Depois é só adicioná-los à ordem de turno.</p>

            <div className="gaveta-opcoes">
                <input className="input-neon gaveta-busca" type="text" placeholder="🔍 Buscar NPC..." value={busca} onChange={e => setBusca(e.target.value)} />
                <label className="gaveta-campo" title="Quantas cópias entram de uma vez (1 a 10)">
                    <span>Qtd.</span>
                    <input className="input-neon" type="number" min="1" max="10" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
                </label>
                <select className="input-neon gaveta-campo-select" value={visibilidadeHp} onChange={e => setVisibilidadeHp(e.target.value)} title="Quem vê a Vida e o Poder do token">
                    <option value="todos">HP Visível</option>
                    <option value="mestre">HP Oculto</option>
                </select>
                <label className="gaveta-check">
                    <input type="checkbox" checked={oculto} onChange={e => setOculto(e.target.checked)} /> 👻 Token invisível
                </label>
            </div>

            {familias.length === 0 ? (
                <p className="gaveta-vazia">{busca ? 'Nenhum NPC com esse nome.' : 'Nenhum NPC na mesa. Crie NPCs na aba Mestre (ou pela Sexta-Feira) e eles aparecem aqui.'}</p>
            ) : familias.map(familia => (
                <div key={familia} className="gaveta-familia">
                    <button type="button" className="gaveta-familia-topo" onClick={() => alternarFamilia(familia)}>
                        <span>{(aberta[familia] || busca) ? '📂' : '📁'} {familia}</span>
                        <span className="gaveta-contador">{grupos[familia].length}</span>
                    </button>
                    {(aberta[familia] || busca) && grupos[familia].map(({ nome, ficha }) => (
                        <GavetaNpcLinha key={nome} nome={nome} ficha={ficha} divisorPoderMesa={divisorPoderMesa} naCena={naCena[nome] || 0} onColocar={colocarEmCombate} />
                    ))}
                </div>
            ))}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#111', padding: '3px 8px', borderRadius: 5, border: '1px solid #444' }} title="Poder Calculado da entidade, na mesma escala do Scouter. Decide a Disputa de Poder contra quem a ataca ou é atacado por ela. Vazio = sem disputa (dano x1).">
                    <span style={{ color: '#ffcc00', fontSize: '0.8em', fontWeight: 'bold' }}>⚡ Poder:</span>
                    <input className="input-neon" type="number" min="0" step="any" id="dummiePoder" placeholder="vazio" style={{ width: 90, padding: 4, margin: 0 }} />
                </div>
                <select className="input-neon" id="dummieVisivel" style={{ width: 110, padding: 5 }} title="Visibilidade do HP">
                    <option value="todos">HP Visível</option><option value="mestre">HP Oculto</option>
                </select>
                <button className="btn-neon btn-blue" onClick={() => {
                    const n = document.getElementById('dummieNome').value || 'Entidade';
                    const hBase = parseInt(document.getElementById('dummieHp').value) || 100;
                    const vit = parseInt(document.getElementById('dummieVitalidade').value) || 0;
                    // 🔥 Reformulação de Vida/Energias: "HP Base" é digitado já na escala EXIBIDA —
                    // multiplica de volta por FATOR_EXIBICAO_VITAIS antes de gravar o valor bruto do dummy.
                    const h = hBase * Math.pow(10, vit) * FATOR_EXIBICAO_VITAIS;
                    const dt = document.getElementById('dummieDefTipo').value;
                    const dv = parseInt(document.getElementById('dummieDef').value) || 10;
                    const vHp = document.getElementById('dummieVisivel').value;
                    const poderTxt = document.getElementById('dummiePoder').value;
                    const poderNum = Number(poderTxt);
                    const poder = (poderTxt === '' || !Number.isFinite(poderNum)) ? null : Math.max(0, poderNum);
                    const id = 'dummie_' + Date.now();
                    salvarDummie(id, { nome: n, hpMax: h, hpAtual: h, tipoDefesa: dt, valorDefesa: dv, visibilidadeHp: vHp, cenaId: cenaRenderId, posicao: { x: 0, y: 0 }, ...(poder !== null ? { poderCalculado: poder } : {}) });
                }} style={{ padding: '5px 15px', margin: 0 }}>+ Injetar na Cena</button>
            </div>
        </div>
    );
}

export function MapaMestreDanoRapido() {
    const ctx = useMapaForm();
    const { isMestre, isModoRP, mestreVendoRP, jogadores, dummies, cenaRenderId, aplicarDanoRapido } = ctx || {};
    const [alvoId, setAlvoId] = useState('');
    const [valorDano, setValorDano] = useState(10);
    // 🛡️ Elemento do dano (opcional): marcar o elemento aqui registra ficha.combate.
    // ultimoElementoRecebido no alvo, e core/fadiga.js > getFatorVidaPerdida/getLimiarSemFadiga
    // descontam/elevam a Fadiga gerada por ESTE dano se o alvo tiver Domínio treinado (página 3)
    // sobre aquele elemento.
    const [elementoDano, setElementoDano] = useState('');
    // 🎚️ Nível de Domínio do ALVO (opcional, 0-10): sobrescreve o Domínio LIDO DA FICHA do alvo
    // pra este golpe específico — em branco usa o Domínio que o próprio personagem tem registrado
    // normalmente (comportamento padrão). Útil pra NPCs/dummies sem Domínio próprio na Ficha.
    const [nivelDominioDano, setNivelDominioDano] = useState('');
    // ⚔️ Nível de Domínio de QUEM GOLPEOU (opcional, 0-10, padrão 0): reduz/anula a vantagem de
    // Redução de Dano do alvo — um golpe vindo de um Domínio igual ou maior que o do alvo
    // atravessa sem nenhuma redução. Em branco = ataque comum, sem Domínio nenhum (0).
    const [nivelAtacanteDano, setNivelAtacanteDano] = useState('');
    // ⚖️ Quem desferiu o golpe (opcional): o dano passa pela Disputa de Poder entre ele e o alvo
    // (core/disputaPoder.js). Vazio = sem disputa, o dano entra como digitado.
    const [atacanteId, setAtacanteId] = useState('');
    // 🎲 O número digitado é uma rolagem de dado: vira proporcional à Vida do alvo (core/danoProporcional.js).
    const [ehDado, setEhDado] = useState(false);
    const [pontosInput, setPontosInput] = useState('');
    const divisorPoderMesa = useStore(s => s.divisorPoderMesa);

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

    // Os returns ficam DEPOIS de todos os hooks: o Mestre alterna o modo RP com o painel aberto,
    // e um hook a menos entre renders derruba a tela.
    if (!ctx) return FALLBACK;
    if (!isMestre || (isModoRP && !mestreVendoRP)) return null;

    const alvoAtual = alvos.find(a => a.id === alvoId) || null;
    const atacanteAtual = alvos.find(a => a.id === atacanteId && a.id !== alvoId) || null;
    const disputaPrevia = (alvoAtual && atacanteAtual)
        ? calcularDisputaPoder(getPoderDeEntidade(atacanteAtual, divisorPoderMesa), getPoderDeEntidade(alvoAtual, divisorPoderMesa))
        : null;

    const aplicar = () => {
        if (!alvoAtual) return alert('Escolha um alvo primeiro.');
        aplicarDanoRapido(alvoAtual, valorDano, elementoDano || null, nivelDominioDano === '' ? null : nivelDominioDano, nivelAtacanteDano === '' ? 0 : nivelAtacanteDano, atacanteAtual, ehDado);
    };

    // Escala da mesa: quantos pontos de dado equivalem à Vida inteira (padrão 200). Fica no cenário.
    const pontosAtuais = getPontosVidaTotal(ctx && ctx.cenario);
    const salvarPontos = () => {
        const v = parseFloat(pontosInput);
        setPontosInput('');
        // Número finito e razoável (Firebase não aceita Infinity): de 1 a 1.000.000 pontos.
        if (!Number.isFinite(v) || !(v >= 1) || v === pontosAtuais) return;
        const novo = JSON.parse(JSON.stringify((ctx && ctx.cenario) || {}));
        novo.pontosDanoVida = Math.min(v, 1000000);
        salvarCenarioCompleto(novo);
    };

    return (
        <div className="fade-in" style={{ background: 'rgba(255, 0, 60, 0.1)', padding: 15, borderRadius: 5, border: '1px solid #ff003c' }}>
            <h3 style={{ color: '#ff003c', margin: 0 }}>⚔️ Dano Rápido</h3>
            <p style={{ color: '#888', fontStyle: 'italic', margin: '5px 0 15px', fontSize: '0.85em' }}>Aplica dano direto na Vida de um jogador ou entidade nesta cena, sem precisar que o alvo digite nada. Escolher quem golpeou aplica a Disputa de Poder entre ele e o alvo. Marcar o Elemento (opcional) já reduz o próprio dano se o Domínio do alvo superar o de quem golpeou (campo "Golpe"), e desconta a Fadiga gerada por este golpe se o alvo tiver Domínio treinado sobre ele.</p>
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
                    <select className="input-neon" value={elementoDano} onChange={e => { setElementoDano(e.target.value); if (!e.target.value) { setNivelDominioDano(''); setNivelAtacanteDano(''); } }} style={{ padding: 5, minWidth: 140 }}>
                        <option value="">Elemento (Físico/Nenhum)</option>
                        {ELEMENTOS_OPCOES.map(grupo => (
                            <optgroup key={grupo.label} label={grupo.label}>
                                {grupo.opcoes.map(el => <option key={el} value={el}>{el}</option>)}
                            </optgroup>
                        ))}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#111', padding: '3px 8px', borderRadius: 5, border: '1px solid #444' }} title="Sobrescreve o Domínio lido da Ficha do alvo pra este golpe (defesa) — em branco usa o Domínio que o personagem já tem registrado.">
                        <span style={{ color: '#ff003c', fontSize: '0.8em', fontWeight: 'bold' }}>Domínio Alvo:</span>
                        <input className="input-neon" type="number" min="0" max="10" placeholder="auto" value={nivelDominioDano} onChange={e => setNivelDominioDano(e.target.value)} style={{ width: 60, padding: 4, margin: 0 }} disabled={!elementoDano} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#111', padding: '3px 8px', borderRadius: 5, border: '1px solid #444' }} title="Domínio de QUEM DESFERIU o golpe nesse elemento — reduz ou anula a vantagem de Redução de Dano do alvo. Em branco/0 = ataque comum, sem Domínio.">
                        <span style={{ color: '#ff003c', fontSize: '0.8em', fontWeight: 'bold' }}>Domínio Golpe:</span>
                        <input className="input-neon" type="number" min="0" max="10" placeholder="0" value={nivelAtacanteDano} onChange={e => setNivelAtacanteDano(e.target.value)} style={{ width: 60, padding: 4, margin: 0 }} disabled={!elementoDano} />
                    </div>
                    {/* ⚖️ Quem golpeou: aplica a Disputa de Poder (depois dos campos de Domínio pra não mudar a ordem dos seletores) */}
                    <select className="input-neon" value={atacanteId} onChange={e => setAtacanteId(e.target.value)} style={{ padding: 5, minWidth: 140 }} title="Quem desferiu o golpe: aplica a Disputa de Poder entre ele e o alvo">
                        <option value="">Golpe de: ninguém (sem Disputa)</option>
                        {alvos.filter(a => a.id !== alvoId).map(a => <option key={a.id} value={a.id}>Golpe de {a.isDummie ? '🤖 ' : '🧑 '}{a.nome}</option>)}
                    </select>
                    <button className="btn-neon btn-red" onClick={aplicar} disabled={!alvoAtual} style={{ padding: '5px 15px', margin: 0, opacity: alvoAtual ? 1 : 0.5 }}>💥 Aplicar Dano</button>
                </div>
            )}
            <div className="dano-escala">
                <label className="dano-de-dado-check" title="Marcado: o número vira proporcional à Vida máxima do alvo (1 ponto = Vida ÷ pontos da mesa). Desmarcado: entra exatamente como digitado.">
                    <input type="checkbox" checked={ehDado} onChange={e => setEhDado(e.target.checked)} /> 🎲 É rolagem de dado (proporcional à Vida do alvo)
                </label>
                <label className="dano-escala-pontos" title="Quantos pontos de dado valem a Vida inteira de um alvo. Padrão 200: cada ponto = 0,5% da Vida. Vale pra toda a mesa.">
                    <span>Escala da mesa: Vida total =</span>
                    <input
                        type="number" min="1" className="input-neon" placeholder={String(pontosAtuais)} value={pontosInput}
                        onChange={e => setPontosInput(e.target.value)} onBlur={salvarPontos}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    />
                    <span>pontos de dado (atual: {pontosAtuais})</span>
                </label>
            </div>
            {disputaPrevia && (
                <DisputaPoderResumo
                    disputa={disputaPrevia}
                    nomeAtacante={atacanteAtual.nome}
                    nomeDefensor={alvoAtual.nome}
                    semPoderTexto="Um dos dois não tem Poder definido (entidades: defina o Poder no token): o dano entra como digitado."
                />
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