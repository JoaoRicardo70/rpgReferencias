import React from 'react';
import useStore from '../../stores/useStore';
import { salvarDummie, deletarDummie } from '../../services/firebase-sync';
import { FATOR_EXIBICAO_VITAIS } from '../../core/vitals';

// 🔥 Formatador de Números Gigantes (K, M, B, T)
const formatNum = (n) => {
    if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.floor(n));
};

export default function DummieToken({ className, id, dummie }) {
    const isMestre = useStore(s => s.isMestre);
    const alvoSelecionado = useStore(s => s.alvoSelecionado);
    const setAlvoSelecionado = useStore(s => s.setAlvoSelecionado);

    if (!dummie) return null;

    const isTarget = alvoSelecionado === id;
    const isDead = dummie.hpAtual <= 0;
    
    const hpVisivel = dummie.visibilidadeHp === 'todos' || isMestre;

    const handleSelecionar = (e) => {
        e.stopPropagation();
        setAlvoSelecionado(isTarget ? null : id);
    };

    const resetarVida = (e) => {
        e.stopPropagation();
        salvarDummie(id, { ...dummie, hpAtual: dummie.hpMax });
    };

    const removerDummie = (e) => {
        e.stopPropagation();
        if (window.confirm('Remover esta Entidade do mapa?')) {
            if (alvoSelecionado === id) setAlvoSelecionado(null);
            deletarDummie(id);
        }
    };

    const pct = Math.max(0, Math.min(100, (dummie.hpAtual / dummie.hpMax) * 100));
    const colorAC = dummie.tipoDefesa === 'evasiva' ? '#0088ff' : '#ccc';

    return (
        <div
            className={className}
            onClick={handleSelecionar}
            title={isTarget ? 'Desmarcar Alvo' : 'Selecionar como Alvo'}
            style={{
                position: 'absolute', top: 2, left: 2, right: 2, bottom: 2,
                backgroundColor: isDead ? 'rgba(50, 0, 0, 0.95)' : 'rgba(20, 20, 20, 0.95)',
                border: isTarget ? '3px solid #ff003c' : '2px solid #ffcc00',
                borderRadius: '8px', display: 'flex', flexDirection: 'column', 
                alignItems: 'center', justifyContent: 'center',
                padding: '2px', cursor: 'crosshair', zIndex: isTarget ? 20 : 5,
                boxShadow: isTarget ? '0 0 15px rgba(255, 0, 60, 0.8)' : '0 0 5px #000',
                transition: 'all 0.2s',
                opacity: isDead ? 0.7 : 1
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', pointerEvents: 'none' }}>
                <span style={{ fontSize: '10px', color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', textDecoration: isDead ? 'line-through' : 'none' }}>
                    {dummie.nome}
                </span>
                <span style={{ fontSize: '9px', color: colorAC, fontWeight: 'bold', background: 'rgba(0,0,0,0.8)', padding: '0 4px', borderRadius: 4, marginTop: 1 }}>
                    🛡️ {dummie.valorDefesa}
                </span>
            </div>

            {/* 🔥 Nova Barra de HP Totalmente Visível (Flutuando abaixo do Token) */}
            {hpVisivel ? (
                <div style={{ width: '120%', position: 'absolute', bottom: -12, background: 'rgba(0,0,0,0.9)', borderRadius: '4px', border: '1px solid #555', overflow: 'visible', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '1px' }}>
                    <span style={{ fontSize: '8px', fontWeight: 'bold', color: '#fff', textShadow: '1px 1px 2px #000', marginBottom: '-1px', zIndex: 2 }}>
                        {/* 🔥 Reformulação de Vida/Energias: hpAtual/hpMax do dummy são gravados na escala
                            BRUTA (ver MestreFormContext.jsx > injetarDummie) -- divide por
                            FATOR_EXIBICAO_VITAIS aqui pra bater com o mesmo valor mostrado no card de
                            combate do Mapa (MapaCombate.jsx) pra essa mesma entidade. */}
                        {formatNum(dummie.hpAtual / FATOR_EXIBICAO_VITAIS)}/{formatNum(dummie.hpMax / FATOR_EXIBICAO_VITAIS)}
                    </span>
                    <div style={{ width: '96%', height: '4px', background: '#333', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: pct > 50 ? '#0f0' : pct > 20 ? '#ffcc00' : '#f00', transition: 'width 0.3s' }} />
                    </div>
                </div>
            ) : (
                <div style={{ width: '120%', position: 'absolute', bottom: -8, background: '#111', borderRadius: '4px', border: '1px solid #555', overflow: 'hidden', zIndex: 10, height: '5px' }} title="HP Oculto">
                    <div style={{ height: '100%', width: '100%', background: 'repeating-linear-gradient(45deg, #444, #444 5px, #222 5px, #222 10px)' }} />
                </div>
            )}
            
            {/* 🔥 Controles Dinâmicos (Flutuando acima do Token) */}
            {(isMestre && isTarget) ? (
                <div style={{ display: 'flex', gap: 2, position: 'absolute', top: '-25px', right: '-20px', background: '#000', padding: 2, borderRadius: 4, border: '1px solid #ffcc00', zIndex: 30 }}>
                    <button onClick={resetarVida} style={{ background: '#00ffcc', color: '#000', border: 'none', borderRadius: 2, fontSize: '10px', cursor: 'pointer', padding: '2px 5px', fontWeight: 'bold' }}>🔄 HP</button>
                    <button onClick={removerDummie} style={{ background: '#ff003c', color: '#fff', border: 'none', borderRadius: 2, fontSize: '10px', cursor: 'pointer', padding: '2px 5px' }}>🗑️</button>
                </div>
            ) : (isDead && isTarget) ? (
                <div style={{ display: 'flex', gap: 2, position: 'absolute', top: '-25px', right: '-20px', background: '#000', padding: 2, borderRadius: 4, border: '1px solid #00ffcc', zIndex: 30 }}>
                    <button onClick={resetarVida} style={{ background: '#00ffcc', color: '#000', border: 'none', borderRadius: 2, fontSize: '10px', cursor: 'pointer', padding: '2px 5px', fontWeight: 'bold' }}>🔄 RESSUSCITAR</button>
                </div>
            ) : null}
        </div>
    );
}