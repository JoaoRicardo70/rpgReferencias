import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useStore from '../../stores/useStore';
import useBotaoArrastavel from '../../hooks/useBotaoArrastavel';
import { ordenarPedidosPendentes } from '../../core/sextaFeiraCriacao';
import { listarDestinos, posicaoNoCirculo } from '../../core/navegacao';

// 🔮 Orbe de navegação (modos "Orbe radial" e "Mesa com painéis"): sem nenhuma barra fixa. Um botão pequeno e arrastável
// abre um menu em círculo com todas as áreas; escolher uma fecha o menu e abre a área. No modo Mesa, a área abre como painel ao
// lado do Mapa. `sessao` = o bloco com sala/conta/sair (SessaoInfo), mostrado embaixo do círculo.
const TAMANHO_ORBE = 52;

export default function OrbeNavegacao({ sessao }) {
    const abaAtiva = useStore(s => s.abaAtiva);
    const setAbaAtiva = useStore(s => s.setAbaAtiva);
    const isMestre = useStore(s => s.isMestre);
    const qtdPedidos = useStore(s => (s.isMestre ? ordenarPedidosPendentes(s.sextaFeiraPendentes).length : 0));

    const [aberto, setAberto] = useState(false);
    const [destaque, setDestaque] = useState(null);
    const orbe = useBotaoArrastavel('rpg_orbe_pos', { largura: TAMANHO_ORBE, altura: TAMANHO_ORBE, topoReservado: 0, fracaoY: 0.06 });
    const destinos = useMemo(() => listarDestinos({ isMestre }), [isMestre]);

    const fechar = useCallback(() => { setAberto(false); setDestaque(null); }, []);
    const irPara = useCallback((destino) => {
        if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
        setAbaAtiva(destino.id);
        fechar();
    }, [setAbaAtiva, fechar]);

    // Fecha com Esc; 1-9 escolhem direto (menos quando você está digitando em algum campo do menu, como a busca do "Controlar").
    useEffect(() => {
        if (!aberto) return undefined;
        const tecla = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const alvo = e.target;
            if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
            if (/^[1-9]$/.test(e.key) && destinos[Number(e.key) - 1]) { e.preventDefault(); irPara(destinos[Number(e.key) - 1]); }
        };
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }, [aberto, destinos, fechar, irPara]);

    const atual = destinos.find(d => d.id === abaAtiva);
    const raio = destinos.length > 10 ? 200 : 170;

    return (
        <>
            <div className="orbe" style={{ left: orbe.pos.x, top: orbe.pos.y }}>
                <button
                    type="button"
                    className={`orbe-botao${aberto ? ' aberto' : ''}`}
                    aria-expanded={aberto}
                    title={`Menu de navegação${atual ? ` — você está em ${atual.nome}` : ''} (arraste para mover)`}
                    onPointerDown={orbe.aoPressionar}
                    onClick={() => { if (orbe.consumirArrasto()) return; setAberto(a => !a); }}
                >
                    <span className="orbe-icone">{atual ? atual.icone : '🔮'}</span>
                    {qtdPedidos > 0 && <span className="sidebar-badge-pedidos" aria-label={`${qtdPedidos} pedido(s) aguardando aprovação`}>{qtdPedidos > 9 ? '9+' : qtdPedidos}</span>}
                </button>
            </div>

            {aberto && typeof document !== 'undefined' && createPortal(
                <div className="orbe-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }} role="dialog" aria-modal="true" aria-label="Menu de navegação">
                    <div className="orbe-menu" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
                        <div className="orbe-anel" style={{ width: raio * 2 + 90, height: raio * 2 + 90 }}>
                            {destinos.map((d, i) => {
                                const p = posicaoNoCirculo(i, destinos.length, raio);
                                return (
                                    <button
                                        key={d.id}
                                        type="button"
                                        className={`orbe-item nav-grupo-${d.grupo}${d.id === abaAtiva ? ' ativa' : ''}`}
                                        style={{ left: `calc(50% + ${p.x}px)`, top: `calc(50% + ${p.y}px)` }}
                                        title={d.nome}
                                        aria-label={d.nome}
                                        onMouseEnter={() => setDestaque(d)}
                                        onFocus={() => setDestaque(d)}
                                        onClick={() => irPara(d)}
                                    >
                                        <span className="orbe-item-icone">{d.icone}</span>
                                        <span className="orbe-item-rotulo">{d.curto || d.nome}</span>
                                    </button>
                                );
                            })}
                            <div className="orbe-centro">
                                <div className="orbe-centro-icone">{(destaque || atual || { icone: '🔮' }).icone}</div>
                                <div className="orbe-centro-nome">{destaque ? destaque.nome : 'Para onde?'}</div>
                                <div className="orbe-centro-dica">{destaque ? destaque.grupoNome : 'Esc fecha · 1-9 escolhe'}</div>
                            </div>
                        </div>
                        {sessao && <div className="orbe-sessao">{sessao}</div>}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
