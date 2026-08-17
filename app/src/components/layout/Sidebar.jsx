import React, { useState } from 'react';
import useStore from '../../stores/useStore';

export default function Sidebar({ onResetClick }) {
    const abaAtiva = useStore(s => s.abaAtiva);
    const setAbaAtiva = useStore(s => s.setAbaAtiva);
    const isMestre = useStore(s => s.isMestre);

    const [gavetaAberta, setGavetaAberta] = useState('entidade');

    // 🗂️ O NOVO SISTEMA DE AGRUPAMENTO (COM A GAVETA DE DIÁRIOS!)
    const categorias = [
        {
            id: 'entidade', icone: '👤', nome: 'Entidade', cor: '#00ffcc', bg: 'rgba(0,255,204,0.15)',
            abas: [
                { id: 'aba-ficha', icone: '📋', nome: 'Ficha' },
                { id: 'aba-perfil', icone: '🆔', nome: 'Perfil' },
            ]
        },
        // 🔥 A NOVA GAVETA EXCLUSIVA PARA AS FICHAS FÍSICAS!
        {
            id: 'diarios', icone: '📜', nome: 'Diários Físicos', cor: '#bba9d8', bg: 'rgba(187,169,216,0.15)',
            abas: [
                { id: 'aba-Ficha Def', icone: '📝', nome: 'Ficha Definitiva' },
                { id: 'aba-grimorio', icone: '📖', nome: 'O Grimório Místico' },
            ]
        },
        {
            id: 'combate', icone: '⚔️', nome: 'Combate', cor: '#ff003c', bg: 'rgba(255,0,60,0.15)',
            abas: [
                { id: 'aba-testes', icone: '🎲', nome: 'Testes' },
                { id: 'aba-ataque', icone: '🗡️', nome: 'Ataque' },
                { id: 'aba-acerto', icone: '🎯', nome: 'Acerto' },
                { id: 'aba-defesa', icone: '🛡️', nome: 'Defesa' },
            ]
        },
        {
            id: 'arsenal', icone: '🎒', nome: 'Arsenal e Oculto', cor: '#ffcc00', bg: 'rgba(255,204,0,0.15)',
            abas: [
                { id: 'aba-poderes', icone: '🌀', nome: 'Poderes Clássicos' },
                { id: 'aba-arsenal', icone: '🎒', nome: 'Inventário' },
                { id: 'aba-elementos', icone: '🔥', nome: 'Elementos' },
            ]
        },
        {
            id: 'mundo', icone: '🌌', nome: 'Multiverso', cor: '#0088ff', bg: 'rgba(0,136,255,0.15)',
            abas: [
                { id: 'aba-mapa', icone: '🗺️', nome: 'Mapa' },
                { id: 'aba-log', icone: '📜', nome: 'Feed e Log' },
                { id: 'aba-compendio', icone: '📚', nome: 'Lore do Mundo' },
                { id: 'aba-musica', icone: '🎵', nome: 'Jukebox' },
                { id: 'aba-oraculo', icone: '🤖', nome: 'Oráculo (IA)' },
                { id: 'aba-gravador', icone: '🎙️', nome: 'Gravador' },
            ]
        }
    ];

    const alternarGaveta = (id) => {
        setGavetaAberta(gavetaAberta === id ? '' : id);
    };

    return (
        <div className="sidebar-magica" style={{
            width: '70px', height: '100vh', background: 'var(--bg-sidebar, rgba(10, 5, 20, 0.6))',
            backdropFilter: 'blur(10px)', borderRight: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0',
            gap: '15px', overflowY: 'auto', overflowX: 'hidden', zIndex: 100,
        }}>
            <style>{`
                .sidebar-magica::-webkit-scrollbar { width: 0px; }
                .gaveta-container { display: flex; flex-direction: column; align-items: center; width: 100%; }
                .btn-macro { width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.6em; cursor: pointer; border: 1px solid transparent; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background: rgba(0,0,0,0.3); color: #fff; filter: grayscale(0.5); }
                .btn-macro:hover { transform: scale(1.1); filter: grayscale(0); background: rgba(255,255,255,0.1); }
                .btn-macro.ativa { filter: grayscale(0); transform: scale(1.05); }
                .sub-abas-wrapper { display: flex; flex-direction: column; gap: 8px; overflow: hidden; transition: max-height 0.4s ease, opacity 0.3s ease, margin 0.3s ease; width: 100%; align-items: center; }
                .sub-abas-wrapper.fechada { max-height: 0px; opacity: 0; pointer-events: none; margin-top: 0; }
                .sub-abas-wrapper.aberta { max-height: 400px; opacity: 1; margin-top: 10px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); }
                .btn-micro { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2em; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; background: rgba(0,0,0,0.5); opacity: 0.6; }
                .btn-micro:hover { opacity: 1; background: rgba(255,255,255,0.1); transform: translateX(3px); }
                .btn-micro.ativa { opacity: 1; transform: scale(1.1); }
            `}</style>

            {isMestre && (
                <div className="gaveta-container" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px', marginBottom: '5px' }}>
                    <button
                        title="Painel do Mestre"
                        className={`btn-macro ${abaAtiva === 'aba-mestre' ? 'ativa' : ''}`}
                        onClick={() => { setAbaAtiva('aba-mestre'); setGavetaAberta(''); }}
                        style={abaAtiva === 'aba-mestre' ? { background: 'rgba(255,204,0,0.2)', borderColor: '#ffcc00', boxShadow: '0 0 15px rgba(255,204,0,0.4)' } : {}}
                    >👑</button>
                </div>
            )}

            {categorias.map(cat => (
                <div key={cat.id} className="gaveta-container">
                    <button
                        title={cat.nome}
                        className={`btn-macro ${gavetaAberta === cat.id ? 'ativa' : ''}`}
                        onClick={() => alternarGaveta(cat.id)}
                        style={gavetaAberta === cat.id ? { background: cat.bg, borderColor: cat.cor, boxShadow: `0 0 15px ${cat.bg}` } : {}}
                    >{cat.icone}</button>

                    <div className={`sub-abas-wrapper ${gavetaAberta === cat.id ? 'aberta' : 'fechada'}`}>
                        {cat.abas.map(aba => (
                            <button
                                key={aba.id}
                                title={aba.nome}
                                className={`btn-micro ${abaAtiva === aba.id ? 'ativa' : ''}`}
                                onClick={() => setAbaAtiva(aba.id)}
                                style={abaAtiva === aba.id ? { background: cat.bg, borderColor: cat.cor, boxShadow: `inset 0 0 10px ${cat.cor}` } : {}}
                            >{aba.icone}</button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}